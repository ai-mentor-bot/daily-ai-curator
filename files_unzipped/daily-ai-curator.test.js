import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_KEY = "test-key";

const {
  buildLineMessage,
  getMostCommonRisk,
  normalizeScoredArticle,
  saveScoredArticles,
} = await import("./daily-ai-curator.js");

function highValueArticle(overrides = {}) {
  return {
    article_title: "Useful AI rollout",
    article_url: "https://example.com/useful-ai",
    category: "CloserAI",
    total_score: 91,
    axis_breakdown: {
      adoption_score: 25,
      revenue_score: 22,
      scalability_score: 20,
      compatibility_score: 24,
    },
    confidence: 0.93,
    applicable_business: ["CloserAI"],
    risk_factors: ["Needs implementation review"],
    implementation_complexity: "LOW",
    priority: "HIGH",
    thinking_summary: "Strong fit",
    thinking_process: "Detailed reasoning",
    ...overrides,
  };
}

function fakeSupabase(responses) {
  const calls = [];

  return {
    calls,
    from(table) {
      return {
        async insert(payload) {
          calls.push({ table, payload });
          const response = responses.shift();
          if (typeof response === "function") {
            return response({ table, payload });
          }
          return response || {};
        },
      };
    },
  };
}

test("normalizes partial scorer output before notification and risk aggregation", () => {
  const normalized = normalizeScoredArticle(
    {
      total_score: "95",
      confidence: null,
      implementation_complexity: "UNEXPECTED",
      priority: "HIGH",
    },
    {
      title: "Partial model response",
      url: "https://example.com/partial",
      searchQuery: { category: "AIメンター" },
    },
    ""
  );

  assert.deepEqual(normalized.applicable_business, []);
  assert.deepEqual(normalized.risk_factors, []);
  assert.equal(normalized.axis_breakdown.adoption_score, 0);
  assert.equal(normalized.confidence, 0);
  assert.equal(normalized.implementation_complexity, "MEDIUM");

  const message = buildLineMessage([normalized]);
  assert.match(message, /対象: 未分類/);
  assert.match(message, /リスク: なし/);
  assert.equal(getMostCommonRisk([normalized, { risk_factors: null }]), "None identified");
});

test("saves rows individually and ignores duplicate v2 rows", async () => {
  const client = fakeSupabase([
    { error: { code: "23505", message: "duplicate key value violates unique constraint" } },
    {},
  ]);

  await saveScoredArticles(
    [
      highValueArticle({ article_url: "https://example.com/duplicate" }),
      highValueArticle({ article_url: "https://example.com/new" }),
    ],
    client
  );

  assert.deepEqual(
    client.calls.map((call) => call.table),
    ["daily_ai_curations_v2", "daily_ai_curations_v2"]
  );
});

test("throws when v2 save and checked legacy fallback both fail", async () => {
  const client = fakeSupabase([
    { error: { code: "42501", message: "permission denied for table daily_ai_curations_v2" } },
    { error: { code: "42501", message: "permission denied for table daily_ai_curations" } },
  ]);

  await assert.rejects(
    () => saveScoredArticles([highValueArticle()], client),
    /Supabase save failed: permission denied/
  );

  assert.deepEqual(
    client.calls.map((call) => call.table),
    ["daily_ai_curations_v2", "daily_ai_curations"]
  );
});
