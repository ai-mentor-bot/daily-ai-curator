import assert from "node:assert/strict";
import { test } from "node:test";

process.env.ANTHROPIC_API_KEY ||= "test";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test";

const {
  buildCurationV2Rows,
  getMostCommonRisk,
  normalizeScorePayload,
  saveScoredArticles,
} = await import("./daily-ai-curator.js");

function createScoredArticle(overrides = {}) {
  return {
    article_title: "AI Sales Case Study",
    article_url: "https://example.com/article",
    category: "CloserAI",
    total_score: 91,
    axis_breakdown: {
      adoption_score: 23,
      revenue_score: 24,
      scalability_score: 22,
      compatibility_score: 22,
    },
    confidence: 0.88,
    applicable_business: ["CloserAI"],
    risk_factors: ["Vendor lock-in"],
    thinking_summary: "Strong fit",
    thinking_process: "Detailed reasoning",
    implementation_complexity: "MEDIUM",
    priority: "HIGH",
    ...overrides,
  };
}

test("normalizes optional LLM array fields before downstream use", () => {
  const normalized = normalizeScorePayload({
    total_score: 88,
    applicable_business: "CloserAI",
  });

  assert.deepEqual(normalized.applicable_business, ["CloserAI"]);
  assert.deepEqual(normalized.risk_factors, []);
  assert.equal(
    getMostCommonRisk([
      normalized,
      { risk_factors: undefined },
      { risk_factors: "Integration risk" },
    ]),
    "Integration risk"
  );
});

test("builds Supabase rows with safe array defaults", () => {
  const [row] = buildCurationV2Rows(
    [
      createScoredArticle({
        applicable_business: undefined,
        risk_factors: "Adoption risk",
      }),
    ],
    "2026-06-04T00:00:00.000Z"
  );

  assert.deepEqual(row.applicable_business, []);
  assert.deepEqual(row.risk_factors, ["Adoption risk"]);
  assert.equal(row.saved_at, "2026-06-04T00:00:00.000Z");
});

test("retries Supabase batch conflicts row-by-row without dropping valid rows", async () => {
  const inserted = [];
  const duplicateUrl = "https://example.com/duplicate";
  const client = {
    from(tableName) {
      return {
        async insert(rows) {
          if (tableName !== "daily_ai_curations_v2") {
            throw new Error(`unexpected fallback table: ${tableName}`);
          }

          if (rows.length > 1) {
            return {
              error: {
                code: "23505",
                message: "duplicate key value violates unique constraint",
              },
            };
          }

          if (rows[0].url === duplicateUrl) {
            return {
              error: {
                code: "23505",
                message: "duplicate key value violates unique constraint",
              },
            };
          }

          inserted.push(rows[0]);
          return { error: null };
        },
      };
    },
  };

  const result = await saveScoredArticles(
    [
      createScoredArticle({ article_title: "First", article_url: duplicateUrl }),
      createScoredArticle({
        article_title: "Second",
        article_url: "https://example.com/second",
      }),
      createScoredArticle({
        article_title: "Third",
        article_url: "https://example.com/third",
      }),
    ],
    client,
    "2026-06-04T00:00:00.000Z"
  );

  assert.equal(result.table, "daily_ai_curations_v2");
  assert.equal(result.saved, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(
    inserted.map((row) => row.title),
    ["Second", "Third"]
  );
});
