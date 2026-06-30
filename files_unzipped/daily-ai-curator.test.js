import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = "test-api-key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_KEY = "test-supabase-key";

const { buildAnthropicRequest, saveScoredArticles } = await import(
  "./daily-ai-curator.js"
);

function createArticle(overrides = {}) {
  return {
    article_title: "Useful AI case study",
    article_url: "https://example.com/useful-ai-case-study",
    category: "CloserAI",
    total_score: 91,
    axis_breakdown: {
      adoption_score: 23,
      revenue_score: 23,
      scalability_score: 22,
      compatibility_score: 23,
    },
    confidence: 0.92,
    applicable_business: ["CloserAI"],
    risk_factors: ["Vendor lock-in"],
    thinking_summary: "Strong fit",
    thinking_process: "Detailed analysis",
    implementation_complexity: "MEDIUM",
    priority: "HIGH",
    ...overrides,
  };
}

function createMockSupabase({ v2Errors = [], legacyErrors = [] } = {}) {
  const calls = [];

  return {
    calls,
    from(table) {
      return {
        async upsert(row, options) {
          calls.push({ method: "upsert", table, row, options });
          return { error: v2Errors.shift() || null };
        },
        async insert(row) {
          calls.push({ method: "insert", table, row });
          return { error: legacyErrors.shift() || null };
        },
      };
    },
  };
}

test("buildAnthropicRequest uses the configured model without thinking by default", () => {
  process.env.ANTHROPIC_MODEL = "test-model";
  delete process.env.ANTHROPIC_ENABLE_THINKING;

  const request = buildAnthropicRequest({
    maxTokens: 2000,
    thinkingBudgetTokens: 1500,
    messages: [{ role: "user", content: "hello" }],
  });

  assert.equal(request.model, "test-model");
  assert.equal(request.max_tokens, 2000);
  assert.equal(request.thinking, undefined);
});

test("buildAnthropicRequest only adds thinking when explicitly enabled", () => {
  process.env.ANTHROPIC_MODEL = "test-model";
  process.env.ANTHROPIC_ENABLE_THINKING = "1";

  const request = buildAnthropicRequest({
    maxTokens: 2000,
    thinkingBudgetTokens: 1500,
    messages: [{ role: "user", content: "hello" }],
  });

  assert.deepEqual(request.thinking, {
    type: "enabled",
    budget_tokens: 1500,
  });
});

test("saveScoredArticles saves each v2 row independently with duplicate-safe upsert", async () => {
  const client = createMockSupabase();
  const articles = [
    createArticle({ article_title: "First", article_url: "https://example.com/1" }),
    createArticle({ article_title: "Second", article_url: "https://example.com/2" }),
  ];

  await saveScoredArticles(articles, client);

  const upserts = client.calls.filter((call) => call.method === "upsert");
  assert.equal(upserts.length, 2);
  assert.ok(upserts.every((call) => !Array.isArray(call.row)));
  assert.ok(
    upserts.every(
      (call) =>
        call.table === "daily_ai_curations_v2" &&
        call.options.onConflict === "url" &&
        call.options.ignoreDuplicates === true
    )
  );
});

test("saveScoredArticles falls back only for rows that fail v2 writes", async () => {
  const client = createMockSupabase({
    v2Errors: [new Error("relation does not exist"), null],
  });
  const articles = [
    createArticle({ article_title: "Fallback", article_url: "https://example.com/a" }),
    createArticle({ article_title: "V2", article_url: "https://example.com/b" }),
  ];

  await saveScoredArticles(articles, client);

  assert.deepEqual(
    client.calls.map((call) => `${call.method}:${call.table}`),
    [
      "upsert:daily_ai_curations_v2",
      "insert:daily_ai_curations",
      "upsert:daily_ai_curations_v2",
    ]
  );
});

test("saveScoredArticles fails the job when v2 and legacy writes both fail", async () => {
  const client = createMockSupabase({
    v2Errors: [new Error("permission denied")],
    legacyErrors: [new Error("permission denied")],
  });

  await assert.rejects(
    saveScoredArticles([createArticle()], client),
    /Failed to save "Useful AI case study"/
  );
});

test("migration keeps curation and learning data service-role-only", async () => {
  const sql = await readFile(
    new URL("./supabase-migration-v2.sql", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(sql, /CREATE POLICY\s+"allow_(select|insert)/);
  assert.match(
    sql,
    /CREATE POLICY "service_role_select_v2" ON daily_ai_curations_v2\s+FOR SELECT TO service_role USING \(true\);/
  );
  assert.match(
    sql,
    /CREATE POLICY "service_role_insert_v2" ON daily_ai_curations_v2\s+FOR INSERT TO service_role WITH CHECK \(true\);/
  );
  assert.match(
    sql,
    /CREATE POLICY "service_role_select_monthly_reports" ON monthly_learning_reports\s+FOR SELECT TO service_role USING \(true\);/
  );
  assert.match(
    sql,
    /CREATE POLICY "service_role_insert_monthly_reports" ON monthly_learning_reports\s+FOR INSERT TO service_role WITH CHECK \(true\);/
  );
  assert.match(
    sql,
    /REVOKE ALL ON daily_ai_curations_v2 FROM anon, authenticated, PUBLIC;/
  );
  assert.match(
    sql,
    /REVOKE ALL ON monthly_learning_reports FROM anon, authenticated, PUBLIC;/
  );
  assert.match(
    sql,
    /REVOKE ALL ON\s+monthly_learning_summary,\s+risk_factor_analysis,\s+implementation_analysis,\s+confidence_distribution\s+FROM anon, authenticated, PUBLIC;/
  );
});
