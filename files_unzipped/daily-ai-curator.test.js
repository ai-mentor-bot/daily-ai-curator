import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || "test-key";

const {
  buildV1CurationPayload,
  buildV2CurationPayload,
  dedupeScoredArticles,
  normalizeScoreResult,
} = await import("./daily-ai-curator.js");

test("normalizeScoreResult rejects invalid scores before persistence", () => {
  assert.equal(normalizeScoreResult({ total_score: 101 }, "bad article"), null);
  assert.equal(normalizeScoreResult({ total_score: "not-a-number" }, "bad article"), null);
});

test("normalizeScoreResult fills optional arrays and safe enum defaults", () => {
  const normalized = normalizeScoreResult(
    {
      axis_breakdown: null,
      total_score: "88",
      confidence: "87",
      applicable_business: null,
      risk_factors: [" implementation risk ", ""],
      implementation_complexity: "UNKNOWN",
      priority: "MAYBE",
    },
    "partial article"
  );

  assert.equal(normalized.total_score, 88);
  assert.equal(normalized.confidence, 0.87);
  assert.deepEqual(normalized.applicable_business, []);
  assert.deepEqual(normalized.risk_factors, ["implementation risk"]);
  assert.equal(normalized.implementation_complexity, "MEDIUM");
  assert.equal(normalized.priority, "HIGH");
});

test("dedupeScoredArticles prevents one duplicate from poisoning a save batch", () => {
  const articles = [
    { article_title: "Same Article", article_url: "https://example.com/post#section" },
    { article_title: "Same Article", article_url: "https://example.com/other" },
    { article_title: "Different", article_url: "https://example.com/post" },
    { article_title: "Unique", article_url: "https://example.com/unique" },
  ];

  assert.deepEqual(dedupeScoredArticles(articles), [articles[0], articles[3]]);
});

test("curation payload builders keep fallback writes schema-safe", () => {
  const article = {
    article_title: "Schema-safe Article",
    article_url: "https://example.com/schema",
    category: "",
    total_score: 90,
    axis_breakdown: null,
    confidence: 0.9,
    applicable_business: null,
    risk_factors: null,
    implementation_complexity: "INVALID",
    priority: "INVALID",
  };

  assert.deepEqual(buildV2CurationPayload(article, "2026-05-22T00:00:00.000Z"), {
    title: "Schema-safe Article",
    url: "https://example.com/schema",
    category: "Unknown",
    total_score: 90,
    breakdown: {},
    confidence: 0.9,
    applicable_business: [],
    risk_factors: [],
    thinking_summary: "",
    thinking_process: "",
    implementation_complexity: "MEDIUM",
    priority: "LOW",
    saved_at: "2026-05-22T00:00:00.000Z",
  });

  assert.deepEqual(buildV1CurationPayload(article, "2026-05-22T00:00:00.000Z"), {
    title: "Schema-safe Article",
    url: "https://example.com/schema",
    category: "Unknown",
    total_score: 90,
    breakdown: {
      adoption: 0,
      revenue_speed: 0,
      scalability: 0,
      stack_compatibility: 0,
    },
    applicable_business: [],
    priority: "LOW",
    saved_at: "2026-05-22T00:00:00.000Z",
  });
});
