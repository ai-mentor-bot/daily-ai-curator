import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";

const {
  buildLineMessage,
  isDuplicateError,
  normalizeScoredArticle,
  saveScoredArticles,
} = await import("./daily-ai-curator.js");

function scoredArticle(overrides = {}) {
  return {
    article_title: "Useful AI case study",
    article_url: "https://example.com/article",
    category: "CloserAI",
    total_score: 91,
    confidence: 0.82,
    axis_breakdown: {
      adoption_score: 24,
      revenue_score: 22,
      scalability_score: 23,
      compatibility_score: 22,
    },
    applicable_business: ["CloserAI"],
    risk_factors: ["integration risk"],
    thinking_summary: "summary",
    thinking_process: "process",
    implementation_complexity: "LOW",
    priority: "HIGH",
    ...overrides,
  };
}

test("normalizes partial scoring payloads before notification formatting", () => {
  const normalized = normalizeScoredArticle({
    total_score: "88",
    confidence: "0.7",
    implementation_complexity: "INVALID",
  });

  assert.equal(normalized.total_score, 88);
  assert.equal(normalized.confidence, 0.7);
  assert.deepEqual(normalized.applicable_business, []);
  assert.deepEqual(normalized.risk_factors, []);
  assert.equal(normalized.implementation_complexity, "MEDIUM");

  const message = buildLineMessage([
    scoredArticle({
      ...normalized,
      article_title: "Partial model output",
      article_url: "https://example.com/partial",
    }),
  ]);

  assert.match(message, /対象: 未分類/);
  assert.match(message, /リスク: なし/);
});

test("saving articles skips duplicate rows without dropping later records", async () => {
  const inserted = [];
  const responses = {
    daily_ai_curations_v2: [
      { error: null },
      { error: { code: "23505", message: "duplicate key value violates unique constraint" } },
      { error: null },
    ],
  };
  const client = {
    from(table) {
      return {
        async insert(record) {
          inserted.push({ table, record });
          return responses[table].shift();
        },
      };
    },
  };

  const result = await saveScoredArticles(
    [
      scoredArticle({ article_title: "first", article_url: "https://example.com/first" }),
      scoredArticle({ article_title: "duplicate", article_url: "https://example.com/first" }),
      scoredArticle({ article_title: "third", article_url: "https://example.com/third" }),
    ],
    client
  );

  assert.deepEqual(result, {
    savedCount: 2,
    duplicateCount: 1,
    failedCount: 0,
  });
  assert.equal(inserted.length, 3);
  assert.deepEqual(inserted.map((item) => item.record.title), ["first", "duplicate", "third"]);
});

test("saving falls back to the legacy table and counts real failures", async () => {
  const inserted = [];
  const responses = {
    daily_ai_curations_v2: [
      { error: { code: "42P01", message: "relation does not exist" } },
      { error: { code: "42501", message: "permission denied" } },
    ],
    daily_ai_curations: [
      { error: null },
      { error: { code: "42501", message: "permission denied" } },
    ],
  };
  const client = {
    from(table) {
      return {
        async insert(record) {
          inserted.push({ table, record });
          return responses[table].shift();
        },
      };
    },
  };

  const result = await saveScoredArticles(
    [
      scoredArticle({ article_title: "fallback-ok", article_url: "https://example.com/fallback-ok" }),
      scoredArticle({ article_title: "fallback-fails", article_url: "https://example.com/fallback-fails" }),
    ],
    client
  );

  assert.deepEqual(result, {
    savedCount: 1,
    duplicateCount: 0,
    failedCount: 1,
  });
  assert.deepEqual(inserted.map((item) => item.table), [
    "daily_ai_curations_v2",
    "daily_ai_curations",
    "daily_ai_curations_v2",
    "daily_ai_curations",
  ]);
});

test("detects duplicate Supabase errors", () => {
  assert.equal(isDuplicateError({ code: "23505" }), true);
  assert.equal(isDuplicateError({ message: "duplicate key value violates unique constraint" }), true);
  assert.equal(isDuplicateError({ code: "42501", message: "permission denied" }), false);
});
