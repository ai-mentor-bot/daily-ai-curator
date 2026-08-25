import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_KEY = "test-supabase-key";

const {
  getMostCommonRisk,
  normalizeScoredArticle,
  notifyLineWithConfidence,
  saveScoredArticles,
  sendLineMessage,
} = await import("./daily-ai-curator.js?test=daily");

function scoredArticle(overrides = {}) {
  return normalizeScoredArticle(
    {
      axis_breakdown: {
        adoption_score: 20,
        revenue_score: 20,
        scalability_score: 20,
        compatibility_score: 20,
      },
      total_score: 85,
      confidence: 0.9,
      priority: "HIGH",
      ...overrides,
    },
    {
      title: overrides.article_title || "Test Article",
      url: overrides.article_url || "https://example.com/article",
      searchQuery: { category: overrides.category || "CloserAI" },
    }
  );
}

function mockSupabase(outcomes, calls = []) {
  return {
    from(table) {
      return {
        upsert(payload, options) {
          calls.push({ table, method: "upsert", payload, options });
          return outcomes[table].shift();
        },
        insert(payload) {
          calls.push({ table, method: "insert", payload });
          return outcomes[table].shift();
        },
      };
    },
  };
}

test("normalizes missing scorer arrays before notification and learning logs", async () => {
  const article = scoredArticle({
    applicable_business: undefined,
    risk_factors: null,
  });

  assert.deepEqual(article.applicable_business, []);
  assert.deepEqual(article.risk_factors, []);
  assert.equal(getMostCommonRisk([article]), "None identified");

  const token = process.env.LINE_MESSAGING_API_TOKEN;
  const userId = process.env.LINE_USER_ID;
  delete process.env.LINE_MESSAGING_API_TOKEN;
  delete process.env.LINE_USER_ID;

  try {
    await notifyLineWithConfidence([article]);
  } finally {
    if (token) process.env.LINE_MESSAGING_API_TOKEN = token;
    if (userId) process.env.LINE_USER_ID = userId;
  }
});

test("saves articles independently and checks the legacy fallback result", async () => {
  const calls = [];
  const client = mockSupabase(
    {
      daily_ai_curations_v2: [
        { error: { message: "duplicate title for day" } },
        { error: null },
      ],
      daily_ai_curations: [{ error: null }],
    },
    calls
  );

  await saveScoredArticles(
    [
      scoredArticle({ article_title: "Existing", article_url: "https://example.com/a" }),
      scoredArticle({ article_title: "New", article_url: "https://example.com/b" }),
    ],
    client
  );

  assert.deepEqual(
    calls.map((call) => `${call.table}.${call.method}`),
    [
      "daily_ai_curations_v2.upsert",
      "daily_ai_curations.insert",
      "daily_ai_curations_v2.upsert",
    ]
  );
  assert.equal(calls[0].options.onConflict, "url");
});

test("throws before success notification when both Supabase save paths fail", async () => {
  const client = mockSupabase({
    daily_ai_curations_v2: [{ error: { message: "v2 unavailable" } }],
    daily_ai_curations: [{ error: { message: "legacy unavailable" } }],
  });

  await assert.rejects(
    saveScoredArticles([scoredArticle()], client),
    /Supabase save failed.*v2 unavailable.*legacy unavailable/
  );
});

test("LINE push API failures are surfaced to the workflow", async () => {
  process.env.LINE_MESSAGING_API_TOKEN = "bad-token";
  process.env.LINE_USER_ID = "user-id";

  await assert.rejects(
    sendLineMessage("hello", async () => ({
      ok: false,
      status: 401,
      text: async () => "invalid token",
    })),
    /LINE push failed: 401 invalid token/
  );
});
