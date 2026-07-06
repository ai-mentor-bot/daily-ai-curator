import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_KEY = "test-supabase-key";

const { normalizeScoredArticle, saveScoredArticles } = await import("./daily-ai-curator.js");

function createScoredArticle(overrides = {}) {
  return {
    article_title: "Useful AI case study",
    article_url: "https://example.com/case-study",
    category: "CloserAI",
    total_score: 88,
    axis_breakdown: {
      adoption_score: 22,
      revenue_score: 21,
      scalability_score: 23,
      compatibility_score: 22,
    },
    confidence: 0.91,
    applicable_business: ["CloserAI"],
    risk_factors: ["vendor lock-in"],
    thinking_summary: "Strong fit",
    thinking_process: "Detailed reasoning",
    implementation_complexity: "LOW",
    priority: "HIGH",
    ...overrides,
  };
}

function createSupabaseStub(handlers) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        upsert(row, options) {
          calls.push({ method: "upsert", table, row, options });
          return handlers.upsert?.(table, row, options) || { error: null };
        },
        insert(row) {
          calls.push({ method: "insert", table, row });
          return handlers.insert?.(table, row) || { error: null };
        },
      };
    },
  };
}

test("normalizeScoredArticle defaults missing arrays and enum fields", () => {
  const article = {
    title: "Partial model output",
    url: "https://example.com/partial",
    searchQuery: { category: "AIメンター" },
  };

  const normalized = normalizeScoredArticle(
    {
      total_score: 84,
      confidence: 1.5,
      axis_breakdown: { adoption_score: 20 },
      implementation_complexity: "EASY",
      priority: "URGENT",
    },
    article,
    "thinking text"
  );

  assert.equal(normalized.total_score, 84);
  assert.equal(normalized.confidence, 1);
  assert.deepEqual(normalized.applicable_business, []);
  assert.deepEqual(normalized.risk_factors, []);
  assert.equal(normalized.implementation_complexity, "MEDIUM");
  assert.equal(normalized.priority, "MEDIUM");
  assert.equal(normalized.axis_breakdown.revenue_score, 0);
});

test("normalizeScoredArticle rejects scores outside DB constraints", () => {
  const normalized = normalizeScoredArticle(
    { total_score: 150 },
    { title: "Invalid score", url: "https://example.com/invalid" }
  );

  assert.equal(normalized, null);
});

test("saveScoredArticles writes rows independently and tolerates duplicates", async () => {
  const duplicateError = {
    code: "23505",
    message: "duplicate key value violates unique constraint",
  };
  const client = createSupabaseStub({
    upsert: (_table, row) => ({
      error: row.url.endsWith("/duplicate") ? duplicateError : null,
    }),
  });
  const duplicate = createScoredArticle({ article_url: "https://example.com/duplicate" });
  const fresh = createScoredArticle({ article_url: "https://example.com/fresh" });

  await saveScoredArticles([duplicate, fresh], client);

  assert.equal(client.calls.length, 2);
  assert.deepEqual(
    client.calls.map((call) => call.method),
    ["upsert", "upsert"]
  );
  assert.equal(client.calls[0].options.onConflict, "url");
  assert.equal(client.calls[0].options.ignoreDuplicates, true);
});

test("saveScoredArticles throws when v1 fallback insert fails", async () => {
  const client = createSupabaseStub({
    upsert: () => ({
      error: { code: "42P01", message: 'relation "daily_ai_curations_v2" does not exist' },
    }),
    insert: () => ({
      error: { message: "permission denied for table daily_ai_curations" },
    }),
  });

  await assert.rejects(
    saveScoredArticles([createScoredArticle()], client),
    /Supabase fallback save failed/
  );
});
