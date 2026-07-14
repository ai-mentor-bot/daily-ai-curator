import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ||= "test-anthropic-key";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-supabase-key";

const { normalizeScoredArticle, saveScoredArticles } = await import("./daily-ai-curator.js");

function sampleArticle(overrides = {}) {
  return {
    article_title: "Useful AI sales automation case study",
    article_url: "https://example.com/ai-sales-case-study",
    category: "CloserAI",
    total_score: 91,
    confidence: 0.88,
    applicable_business: ["CloserAI"],
    risk_factors: ["integration cost"],
    axis_breakdown: {
      adoption_score: 23,
      revenue_score: 24,
      scalability_score: 22,
      compatibility_score: 22,
    },
    thinking_summary: "Strong implementation fit",
    thinking_process: "Detailed model reasoning",
    implementation_complexity: "MEDIUM",
    priority: "HIGH",
    ...overrides,
  };
}

function createMockSupabase({ upsertResults = [], insertResults = [] } = {}) {
  const calls = [];

  return {
    calls,
    from(table) {
      return {
        async upsert(row, options) {
          calls.push({ method: "upsert", table, row, options });
          return upsertResults.shift() || { error: null };
        },
        async insert(rows) {
          calls.push({ method: "insert", table, rows });
          return insertResults.shift() || { error: null };
        },
      };
    },
  };
}

test("normalizes scorer fields that notifications and storage treat as arrays", () => {
  const article = normalizeScoredArticle(
    sampleArticle({
      applicable_business: "CloserAI",
      risk_factors: null,
      total_score: "89",
      confidence: "0.91",
    })
  );

  assert.deepEqual(article.applicable_business, ["CloserAI"]);
  assert.deepEqual(article.risk_factors, []);
  assert.equal(article.total_score, 89);
  assert.equal(article.confidence, 0.91);
});

test("duplicate v2 rows are skipped without aborting later article saves", async () => {
  const client = createMockSupabase({
    upsertResults: [
      {
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
        },
      },
      { error: null },
    ],
  });

  const stats = await saveScoredArticles(
    [
      sampleArticle(),
      sampleArticle({
        article_title: "Second high value article",
        article_url: "https://example.com/second",
      }),
    ],
    client
  );

  assert.deepEqual(stats, {
    savedV2: 1,
    savedLegacy: 0,
    duplicatesSkipped: 1,
  });
  assert.equal(client.calls.filter((call) => call.method === "upsert").length, 2);
  assert.equal(client.calls.some((call) => call.method === "insert"), false);
});

test("non-duplicate v2 failures fall back to a checked legacy insert", async () => {
  const client = createMockSupabase({
    upsertResults: [{ error: { code: "42P01", message: "missing v2 table" } }],
    insertResults: [{ error: null }],
  });

  const stats = await saveScoredArticles([sampleArticle()], client);

  assert.equal(stats.savedV2, 0);
  assert.equal(stats.savedLegacy, 1);
  assert.equal(client.calls[1].method, "insert");
  assert.equal(client.calls[1].table, "daily_ai_curations");
});

test("unrecoverable Supabase save failures are surfaced to fail the workflow", async () => {
  const client = createMockSupabase({
    upsertResults: [{ error: { code: "42P01", message: "missing v2 table" } }],
    insertResults: [{ error: { message: "missing legacy table" } }],
  });

  await assert.rejects(
    () => saveScoredArticles([sampleArticle()], client),
    /Failed to save "Useful AI sales automation case study"/
  );
});
