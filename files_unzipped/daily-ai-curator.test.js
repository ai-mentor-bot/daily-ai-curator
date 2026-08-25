import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ||= "test-api-key";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-supabase-key";

const {
  buildLineMessageWithConfidence,
  normalizeScoringResult,
  saveScoredArticles,
} = await import("./daily-ai-curator.js");

function scoredArticle(overrides = {}) {
  return {
    ...normalizeScoringResult({
      axis_breakdown: {
        adoption_score: 23,
        revenue_score: 22,
        scalability_score: 21,
        compatibility_score: 20,
      },
      total_score: 86,
      confidence: 0.82,
      applicable_business: ["CloserAI"],
      risk_factors: ["integration risk"],
      implementation_complexity: "LOW",
      priority: "HIGH",
      decision: "APPROVE",
    }),
    article_title: "Useful AI case study",
    article_url: "https://example.com/article",
    category: "CloserAI",
    thinking_summary: "summary",
    thinking_process: "full thinking",
    ...overrides,
  };
}

test("normalizes model output before storage and notification", () => {
  const normalized = normalizeScoringResult({
    axis_breakdown: {
      adoption_score: "30",
      revenue_score: "20",
    },
    total_score: "91",
    confidence: "87",
    applicable_business: "CloserAI",
    risk_factors: null,
    implementation_complexity: "unexpected",
    priority: "",
    decision: "approve",
  });

  assert.equal(normalized.total_score, 91);
  assert.equal(normalized.confidence, 0.87);
  assert.deepEqual(normalized.applicable_business, ["CloserAI"]);
  assert.deepEqual(normalized.risk_factors, []);
  assert.equal(normalized.axis_breakdown.adoption_score, 25);
  assert.equal(normalized.axis_breakdown.revenue_score, 20);
  assert.equal(normalized.implementation_complexity, "MEDIUM");
  assert.equal(normalized.priority, "HIGH");
  assert.equal(normalized.decision, "APPROVE");
});

test("builds LINE message from normalized articles without array crashes", () => {
  const article = scoredArticle({
    ...normalizeScoringResult({
      total_score: "88",
      confidence: "76",
      applicable_business: "CloserAI",
      risk_factors: undefined,
    }),
  });

  const message = buildLineMessageWithConfidence([article]);

  assert.match(message, /Useful AI case study/);
  assert.match(message, /CloserAI/);
});

test("continues saving later articles when one v2 insert is a duplicate", async () => {
  const calls = [];
  const client = {
    from(table) {
      return {
        async insert(rows) {
          calls.push({ table, rows });
          if (rows[0].url === "https://example.com/duplicate") {
            return {
              error: {
                code: "23505",
                message: "duplicate key value violates unique constraint",
              },
            };
          }
          return { error: null };
        },
      };
    },
  };

  const summary = await saveScoredArticles(
    [
      scoredArticle({ article_url: "https://example.com/duplicate" }),
      scoredArticle({ article_url: "https://example.com/new" }),
    ],
    client,
    () => "2026-06-12T11:00:00.000Z"
  );

  assert.deepEqual(summary, {
    v2Saved: 1,
    legacySaved: 0,
    duplicatesSkipped: 1,
    failed: 0,
  });
  assert.deepEqual(calls.map((call) => call.table), [
    "daily_ai_curations_v2",
    "daily_ai_curations_v2",
  ]);
});
