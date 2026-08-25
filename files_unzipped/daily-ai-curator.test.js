import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getMostCommonRisk,
  normalizeScoredArticle,
  notifyLineWithConfidence,
  saveScoredArticles,
} from "./daily-ai-curator.js";

function highValueArticle(overrides = {}) {
  return normalizeScoredArticle({
    article_title: "AI sales case study",
    article_url: "https://example.com/ai-sales",
    category: "CloserAI",
    total_score: 91,
    confidence: 0.82,
    applicable_business: ["CloserAI"],
    risk_factors: ["integration risk"],
    implementation_complexity: "LOW",
    priority: "HIGH",
    axis_breakdown: {
      adoption_score: 24,
      revenue_score: 23,
      scalability_score: 22,
      compatibility_score: 22,
    },
    thinking_summary: "Strong fit",
    thinking_process: "Detailed reasoning",
    ...overrides,
  });
}

class MockSupabase {
  constructor(responses = []) {
    this.responses = responses;
    this.calls = [];
  }

  from(table) {
    return {
      upsert: async (row, options) => {
        this.calls.push({ method: "upsert", table, row, options });
        return this.responses.shift() || { error: null };
      },
      insert: async (row) => {
        this.calls.push({ method: "insert", table, row });
        return this.responses.shift() || { error: null };
      },
    };
  }
}

test("saveScoredArticles upserts each row by URL to avoid duplicate batch loss", async () => {
  const supabase = new MockSupabase();
  const articles = [
    highValueArticle({ article_title: "First" }),
    highValueArticle({ article_title: "Duplicate URL" }),
  ];

  await saveScoredArticles(supabase, articles);

  assert.equal(supabase.calls.length, 2);
  assert.deepEqual(
    supabase.calls.map((call) => ({
      method: call.method,
      table: call.table,
      onConflict: call.options?.onConflict,
      url: call.row.url,
    })),
    [
      {
        method: "upsert",
        table: "daily_ai_curations_v2",
        onConflict: "url",
        url: "https://example.com/ai-sales",
      },
      {
        method: "upsert",
        table: "daily_ai_curations_v2",
        onConflict: "url",
        url: "https://example.com/ai-sales",
      },
    ]
  );
});

test("saveScoredArticles checks fallback errors before success notification can proceed", async () => {
  const supabase = new MockSupabase([
    { error: new Error("duplicate key") },
    { error: new Error("legacy table insert failed") },
  ]);

  await assert.rejects(
    saveScoredArticles(supabase, [highValueArticle()]),
    /Failed to save 1\/1 scored articles to Supabase/
  );

  assert.deepEqual(
    supabase.calls.map((call) => `${call.method}:${call.table}`),
    ["upsert:daily_ai_curations_v2", "insert:daily_ai_curations"]
  );
});

test("saveScoredArticles falls back per row without dropping later articles", async () => {
  const supabase = new MockSupabase([
    { error: new Error("v2 row failed") },
    { error: null },
    { error: null },
  ]);

  await saveScoredArticles(supabase, [
    highValueArticle({ article_title: "Fallback row" }),
    highValueArticle({
      article_title: "Later row",
      article_url: "https://example.com/later",
    }),
  ]);

  assert.deepEqual(
    supabase.calls.map((call) => `${call.method}:${call.table}`),
    [
      "upsert:daily_ai_curations_v2",
      "insert:daily_ai_curations",
      "upsert:daily_ai_curations_v2",
    ]
  );
});

test("normalizeScoredArticle supplies safe defaults for partial LLM JSON", () => {
  const normalized = normalizeScoredArticle({
    article_title: "Partial response",
    article_url: "https://example.com/partial",
    category: "Content",
    total_score: "88",
  });

  assert.equal(normalized.total_score, 88);
  assert.equal(normalized.confidence, 0);
  assert.deepEqual(normalized.applicable_business, []);
  assert.deepEqual(normalized.risk_factors, []);
  assert.deepEqual(normalized.axis_breakdown, {
    adoption_score: 0,
    revenue_score: 0,
    scalability_score: 0,
    compatibility_score: 0,
  });
  assert.equal(normalized.implementation_complexity, "MEDIUM");
  assert.equal(normalized.priority, "MEDIUM");
});

test("notification and risk summary tolerate missing optional arrays", async () => {
  await notifyLineWithConfidence([
    {
      article_title: "Missing arrays",
      article_url: "https://example.com/missing",
      category: "AIメンター",
      total_score: 90,
    },
  ]);

  assert.equal(getMostCommonRisk([{ risk_factors: undefined }]), "None identified");
});
