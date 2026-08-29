import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_KEY = "test-supabase-key";

const {
  buildLineMessage,
  normalizeScoredArticle,
  saveScoredArticles,
  toLegacyRow,
} = await import("./daily-ai-curator.js");

function highValueArticle(overrides = {}) {
  return normalizeScoredArticle({
    article_title: "AI Sales Automation Case Study",
    article_url: "https://example.com/ai-sales",
    category: "CloserAI",
    total_score: 88,
    confidence: 0.82,
    axis_breakdown: {
      adoption_score: 22,
      revenue_score: 23,
      scalability_score: 21,
      compatibility_score: 22,
    },
    applicable_business: ["CloserAI"],
    risk_factors: ["Vendor lock-in"],
    implementation_complexity: "LOW",
    priority: "HIGH",
    ...overrides,
  });
}

function mockDb(insertHandler) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        async insert(row) {
          calls.push({ table, row });
          return insertHandler(table, row, calls);
        },
      };
    },
  };
}

test("normalizes malformed high-scoring LLM output before notification and legacy fallback", () => {
  const article = highValueArticle({
    confidence: 92,
    axis_breakdown: undefined,
    applicable_business: undefined,
    risk_factors: undefined,
    implementation_complexity: "medium",
    priority: "urgent",
  });

  assert.equal(article.confidence, 0.92);
  assert.deepEqual(article.applicable_business, []);
  assert.deepEqual(article.risk_factors, []);
  assert.equal(article.implementation_complexity, "MEDIUM");
  assert.equal(article.priority, "HIGH");

  const message = buildLineMessage([article]);
  assert.match(message, /対象: 未指定/);
  assert.match(message, /リスク: なし/);

  const legacyRow = toLegacyRow(article, "2026-06-07T00:00:00.000Z");
  assert.deepEqual(legacyRow.breakdown, {
    adoption: 0,
    revenue_speed: 0,
    scalability: 0,
    stack_compatibility: 0,
  });
});

test("saveScoredArticles saves valid rows around a per-row v2 constraint failure", async () => {
  const articles = [
    highValueArticle({ article_title: "First", article_url: "https://example.com/first" }),
    highValueArticle({ article_title: "Duplicate", article_url: "https://example.com/duplicate" }),
    highValueArticle({ article_title: "Third", article_url: "https://example.com/third" }),
  ];
  const db = mockDb((_table, row) => ({
    error:
      row.title === "Duplicate"
        ? { code: "23505", message: "duplicate key value violates unique constraint" }
        : null,
  }));

  const result = await saveScoredArticles(articles, db);

  assert.deepEqual(result, {
    attempted: 3,
    saved: 2,
    failed: 1,
    fallbackSaved: 0,
  });
  assert.equal(db.calls.length, 3);
  assert.deepEqual(
    db.calls.map((call) => call.table),
    ["daily_ai_curations_v2", "daily_ai_curations_v2", "daily_ai_curations_v2"]
  );
});

test("saveScoredArticles falls back to legacy table when v2 schema is unavailable", async () => {
  const article = highValueArticle({
    axis_breakdown: undefined,
    applicable_business: undefined,
    risk_factors: undefined,
  });
  const db = mockDb((table) => ({
    error:
      table === "daily_ai_curations_v2"
        ? { code: "42P01", message: 'relation "daily_ai_curations_v2" does not exist' }
        : null,
  }));

  const result = await saveScoredArticles([article], db);

  assert.deepEqual(result, {
    attempted: 1,
    saved: 1,
    failed: 0,
    fallbackSaved: 1,
  });
  assert.deepEqual(
    db.calls.map((call) => call.table),
    ["daily_ai_curations_v2", "daily_ai_curations"]
  );
  assert.equal(db.calls[1].row.breakdown.adoption, 0);
});
