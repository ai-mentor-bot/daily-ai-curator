import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";

const { normalizeScoreForStorage, saveScoredArticles } = await import(
  "./daily-ai-curator.js"
);

function article(overrides = {}) {
  return {
    article_title: "AI sales automation case study",
    article_url: "https://example.com/article",
    category: "CloserAI",
    total_score: 91,
    axis_breakdown: {
      adoption_score: 24,
      revenue_score: 23,
      scalability_score: 22,
      compatibility_score: 22,
    },
    confidence: 0.92,
    applicable_business: ["CloserAI"],
    risk_factors: ["implementation cost"],
    thinking_summary: "Strong fit",
    thinking_process: "Detailed reasoning",
    implementation_complexity: "LOW",
    priority: "HIGH",
    ...overrides,
  };
}

function createMockSupabase(responsesByTable) {
  const calls = [];

  return {
    calls,
    from(table) {
      return {
        async insert(rows) {
          calls.push({ table, rows });
          const responses = responsesByTable[table] || [];
          return responses.shift() || { error: null };
        },
      };
    },
  };
}

test("saveScoredArticles skips only duplicate rows and saves later rows", async () => {
  const duplicateError = {
    code: "23505",
    message: "duplicate key value violates unique constraint",
  };
  const client = createMockSupabase({
    daily_ai_curations_v2: [
      { error: null },
      { error: duplicateError },
      { error: null },
    ],
  });

  const result = await saveScoredArticles(
    [
      article({ article_url: "https://example.com/new-1" }),
      article({ article_url: "https://example.com/duplicate" }),
      article({ article_url: "https://example.com/new-2" }),
    ],
    client
  );

  assert.deepEqual(result, {
    savedToV2: 2,
    savedToV1: 0,
    skippedDuplicates: 1,
  });
  assert.equal(client.calls.length, 3);
  assert.deepEqual(
    client.calls.map((call) => call.table),
    [
      "daily_ai_curations_v2",
      "daily_ai_curations_v2",
      "daily_ai_curations_v2",
    ]
  );
});

test("saveScoredArticles throws when v2 and fallback saves both fail", async () => {
  const client = createMockSupabase({
    daily_ai_curations_v2: [
      { error: { code: "42P01", message: "relation does not exist" } },
    ],
    daily_ai_curations: [
      { error: { code: "42501", message: "permission denied" } },
    ],
  });

  await assert.rejects(
    saveScoredArticles([article()], client),
    /Supabase save failed.*relation does not exist.*permission denied/
  );
});

test("normalizeScoreForStorage makes scorer output safe for storage and notifications", () => {
  const normalized = normalizeScoreForStorage(
    article({
      total_score: "86",
      confidence: "0.81",
      applicable_business: "CloserAI",
      risk_factors: null,
      implementation_complexity: "UNKNOWN",
      priority: undefined,
      axis_breakdown: {
        adoption_score: "20",
        revenue_score: "21",
        scalability_score: "22",
        compatibility_score: "23",
      },
    })
  );

  assert.equal(normalized.total_score, 86);
  assert.equal(normalized.confidence, 0.81);
  assert.deepEqual(normalized.applicable_business, ["CloserAI"]);
  assert.deepEqual(normalized.risk_factors, []);
  assert.equal(normalized.implementation_complexity, "MEDIUM");
  assert.equal(normalized.priority, "HIGH");
  assert.deepEqual(normalized.axis_breakdown, {
    adoption_score: 20,
    revenue_score: 21,
    scalability_score: 22,
    compatibility_score: 23,
  });
});
