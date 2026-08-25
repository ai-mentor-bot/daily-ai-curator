import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_KEY = "test-supabase-key";
process.env.LINE_MESSAGING_API_TOKEN = "test-line-token";
process.env.LINE_USER_ID = "test-line-user";
process.env.ANTHROPIC_ENABLE_THINKING = "0";

const {
  createLegacyRow,
  dedupeScoredArticlesByUrl,
  normalizeScoredArticle,
  saveScoredArticles,
} = await import("./daily-ai-curator.js");

function scoredArticle(overrides = {}) {
  return {
    axis_breakdown: {
      adoption_score: 20,
      revenue_score: 21,
      scalability_score: 22,
      compatibility_score: 23,
    },
    total_score: 90,
    confidence: 0.8,
    applicable_business: ["CloserAI"],
    risk_factors: ["Vendor lock-in"],
    implementation_complexity: "LOW",
    priority: "HIGH",
    thinking_process: "thinking",
    thinking_summary: "thinking",
    article_title: "Useful AI case study",
    article_url: "https://example.com/article",
    category: "CloserAI",
    ...overrides,
  };
}

function fakeSupabase({ upsert, insert }) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        async upsert(row, options) {
          calls.push({ method: "upsert", table, row, options });
          return upsert ? upsert({ table, row, options, calls }) : { error: null };
        },
        async insert(row) {
          calls.push({ method: "insert", table, row });
          return insert ? insert({ table, row, calls }) : { error: null };
        },
      };
    },
  };
}

test("normalizes malformed scorer output before persistence and notification", () => {
  const normalized = normalizeScoredArticle(
    {
      axis_breakdown: {
        adoption_score: "30",
      },
      total_score: "91.8",
      confidence: 1.5,
      applicable_business: "CloserAI",
      risk_factors: null,
      implementation_complexity: "invalid",
      priority: "high",
    },
    {
      title: "Scored article",
      url: "https://example.com/scored",
      searchQuery: { category: "AIメンター" },
    },
    "detailed thinking process"
  );

  assert.equal(normalized.total_score, 92);
  assert.equal(normalized.confidence, 1);
  assert.deepEqual(normalized.applicable_business, []);
  assert.deepEqual(normalized.risk_factors, []);
  assert.equal(normalized.axis_breakdown.adoption_score, 25);
  assert.equal(normalized.axis_breakdown.revenue_score, 0);
  assert.equal(normalized.implementation_complexity, "MEDIUM");
  assert.equal(normalized.priority, "HIGH");

  const legacyRow = createLegacyRow(normalized, "2026-07-10T00:00:00.000Z");
  assert.deepEqual(legacyRow.breakdown, {
    adoption: 25,
    revenue_speed: 0,
    scalability: 0,
    stack_compatibility: 0,
  });
});

test("deduplicates high-value articles by URL using the highest score", () => {
  const articles = [
    scoredArticle({ article_title: "Lower", article_url: "https://example.com/a", total_score: 82 }),
    scoredArticle({ article_title: "Unique", article_url: "https://example.com/b", total_score: 88 }),
    scoredArticle({ article_title: "Higher", article_url: "https://example.com/a", total_score: 95 }),
  ];

  const deduped = dedupeScoredArticlesByUrl(articles);

  assert.equal(deduped.length, 2);
  assert.equal(
    deduped.find((article) => article.article_url === "https://example.com/a").article_title,
    "Higher"
  );
});

test("saveScoredArticles retries old url-only conflict target and avoids duplicate batch loss", async () => {
  const fake = fakeSupabase({
    upsert: ({ options }) => {
      if (options.onConflict === "url,saved_date") {
        return { error: { message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" } };
      }
      return { error: null };
    },
  });

  const saved = await saveScoredArticles(
    [
      scoredArticle({ article_title: "Lower", article_url: "https://example.com/a", total_score: 82 }),
      scoredArticle({ article_title: "Higher", article_url: "https://example.com/a", total_score: 95 }),
    ],
    fake
  );

  assert.equal(saved.length, 1);
  assert.equal(saved[0].article_title, "Higher");
  assert.deepEqual(
    fake.calls.map((call) => `${call.method}:${call.table}:${call.options?.onConflict || ""}`),
    [
      "upsert:daily_ai_curations_v2:url,saved_date",
      "upsert:daily_ai_curations_v2:url",
    ]
  );
});

test("saveScoredArticles rejects when v2 and checked legacy fallback both fail", async () => {
  const fake = fakeSupabase({
    upsert: () => ({ error: { message: "v2 unavailable" } }),
    insert: () => ({ error: { message: "legacy denied" } }),
  });

  await assert.rejects(
    () => saveScoredArticles([scoredArticle()], fake),
    /Failed to save 1\/1 high-value articles/
  );
});

test("migration restricts internal tables and views to service role", () => {
  const sql = readFileSync(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

  assert.doesNotMatch(sql, /FOR\s+SELECT\s+USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /FOR\s+INSERT\s+WITH\s+CHECK\s*\(\s*true\s*\)/i);
  assert.match(sql, /FOR SELECT TO service_role USING \(true\)/);
  assert.match(sql, /FOR INSERT TO service_role WITH CHECK \(true\)/);
  assert.match(sql, /REVOKE ALL ON TABLE daily_ai_curations_v2 FROM anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON TABLE monthly_learning_reports FROM anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON TABLE monthly_learning_summary FROM anon, authenticated;/);
  assert.match(sql, /GRANT SELECT ON TABLE confidence_distribution TO service_role;/);
});

test("active workflow has preflight checks and propagates curator failures", () => {
  const workflow = readFileSync(new URL("../.github/workflows/daily-curator.yml", import.meta.url), "utf8");

  assert.match(workflow, /Preflight required secrets/);
  assert.match(workflow, /Missing GitHub Secret: ANTHROPIC_API_KEY/);
  assert.match(workflow, /runCuratorWithHackathonTechniques\(\)\)\.catch/);
  assert.match(workflow, /process\.exit\(1\)/);
});
