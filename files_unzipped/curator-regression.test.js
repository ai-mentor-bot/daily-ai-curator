import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ||= "test-anthropic-key";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-supabase-key";

const { saveScoredArticles } = await import("./daily-ai-curator.js");
const { mergeCurationRows } = await import("./monthly-learning-loop.js");

function createArticle(overrides = {}) {
  return {
    article_title: "AI Sales Automation",
    article_url: "https://example.com/ai-sales",
    category: "CloserAI",
    total_score: 91,
    axis_breakdown: {
      adoption_score: 24,
      revenue_score: 23,
      scalability_score: 22,
      compatibility_score: 22,
    },
    confidence: 0.91,
    applicable_business: ["CloserAI"],
    risk_factors: ["integration"],
    thinking_summary: "Strong implementation fit.",
    thinking_process: "Detailed reasoning for monthly learning.",
    implementation_complexity: "MEDIUM",
    priority: "HIGH",
    ...overrides,
  };
}

function createSupabaseStub({ v2Errors = [], legacyErrors = [] } = {}) {
  const calls = [];
  let v2CallCount = 0;
  let legacyCallCount = 0;

  return {
    calls,
    client: {
      from(table) {
        return {
          async insert(rows) {
            calls.push({ table, rows });

            if (table === "daily_ai_curations_v2") {
              return { error: v2Errors[v2CallCount++] || null };
            }

            if (table === "daily_ai_curations") {
              return { error: legacyErrors[legacyCallCount++] || null };
            }

            throw new Error(`Unexpected table: ${table}`);
          },
        };
      },
    },
  };
}

test("saveScoredArticles skips only duplicate v2 rows", async () => {
  const duplicateError = {
    code: "23505",
    message: "duplicate key value violates unique constraint",
  };
  const { calls, client } = createSupabaseStub({
    v2Errors: [null, duplicateError, null],
  });

  const result = await saveScoredArticles(
    [
      createArticle({ article_url: "https://example.com/one" }),
      createArticle({ article_url: "https://example.com/duplicate" }),
      createArticle({ article_url: "https://example.com/two" }),
    ],
    client
  );

  assert.deepEqual(result, {
    insertedV2: 2,
    skippedDuplicates: 1,
    insertedLegacy: 0,
  });
  assert.equal(
    calls.filter((call) => call.table === "daily_ai_curations_v2").length,
    3
  );
  assert.equal(
    calls.filter((call) => call.table === "daily_ai_curations").length,
    0
  );
});

test("saveScoredArticles checks legacy fallback failures", async () => {
  const { client } = createSupabaseStub({
    v2Errors: [{ code: "PGRST205", message: "table not found" }],
    legacyErrors: [{ message: "legacy insert failed" }],
  });

  await assert.rejects(
    saveScoredArticles([createArticle()], client),
    /legacy insert failed/
  );
});

test("mergeCurationRows keeps v2 rows and includes non-duplicate legacy rows", () => {
  const merged = mergeCurationRows(
    [
      { title: "v2 high", url: "https://example.com/a", total_score: 95 },
      { title: "v2 duplicate", url: "https://example.com/b", total_score: 90 },
    ],
    [
      { title: "legacy duplicate", url: "https://example.com/b", total_score: 99 },
      { title: "legacy unique", url: "https://example.com/c", total_score: 92 },
    ]
  );

  assert.deepEqual(
    merged.map((row) => row.title),
    ["v2 high", "legacy unique", "v2 duplicate"]
  );
});

test("migration restricts internal tables and views to service role", async () => {
  const sql = await readFile(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

  assert.match(sql, /CREATE POLICY "service_role_all_v2"[\s\S]*FOR ALL TO service_role/);
  assert.match(
    sql,
    /CREATE POLICY "service_role_all_monthly_reports"[\s\S]*FOR ALL TO service_role/
  );
  assert.match(sql, /REVOKE ALL ON TABLE daily_ai_curations_v2 FROM anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON TABLE monthly_learning_reports FROM anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON confidence_distribution FROM anon, authenticated/);
  assert.match(sql, /GROUP BY confidence_bracket, sort_order/);
  assert.doesNotMatch(sql, /FOR INSERT WITH CHECK \(true\)/);
  assert.doesNotMatch(sql, /FOR SELECT USING \(true\)/);
});
