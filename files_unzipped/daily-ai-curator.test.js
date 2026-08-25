import test from "node:test";
import assert from "node:assert/strict";

process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";

const { __test__ } = await import("./daily-ai-curator.js");

function createArticle(overrides = {}) {
  return {
    article_title: "AI sales automation case study",
    article_url: "https://example.com/article",
    category: "CloserAI",
    total_score: 91,
    axis_breakdown: {
      adoption_score: 23,
      revenue_score: 22,
      scalability_score: 24,
      compatibility_score: 22,
    },
    confidence: 0.88,
    applicable_business: ["CloserAI"],
    risk_factors: ["integration complexity"],
    thinking_summary: "Strong fit",
    thinking_process: "Detailed reasoning",
    implementation_complexity: "MEDIUM",
    priority: "HIGH",
    ...overrides,
  };
}

function createMockSupabase(insertHandler) {
  const calls = [];

  return {
    calls,
    from(table) {
      return {
        async insert(rows) {
          calls.push({ table, rows });
          return insertHandler(table, rows, calls);
        },
      };
    },
  };
}

test("saveScoredArticles skips duplicate v2 rows without falling back to legacy", async () => {
  const articles = [
    createArticle({ article_url: "https://example.com/new" }),
    createArticle({ article_url: "https://example.com/duplicate" }),
    createArticle({ article_url: "https://example.com/fallback" }),
  ];

  const supabase = createMockSupabase((table, rows) => {
    const [{ url }] = rows;

    if (table === "daily_ai_curations_v2" && url.includes("duplicate")) {
      return {
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
        },
      };
    }

    if (table === "daily_ai_curations_v2" && url.includes("fallback")) {
      return {
        error: {
          code: "42P01",
          message: "relation daily_ai_curations_v2 does not exist",
        },
      };
    }

    return { error: null };
  });

  const summary = await __test__.saveScoredArticles(articles, supabase);

  assert.deepEqual(summary, {
    insertedV2: 1,
    duplicateV2: 1,
    insertedLegacy: 1,
  });
  assert.equal(
    supabase.calls.filter((call) => call.table === "daily_ai_curations_v2").length,
    3
  );
  assert.equal(
    supabase.calls.filter((call) => call.table === "daily_ai_curations").length,
    1
  );
  assert.equal(
    supabase.calls.find((call) => call.table === "daily_ai_curations").rows[0].url,
    "https://example.com/fallback"
  );
});

test("saveScoredArticles throws when legacy fallback also fails", async () => {
  const supabase = createMockSupabase((table) => {
    if (table === "daily_ai_curations_v2") {
      return {
        error: {
          code: "42P01",
          message: "relation daily_ai_curations_v2 does not exist",
        },
      };
    }

    return {
      error: {
        code: "42501",
        message: "permission denied for table daily_ai_curations",
      },
    };
  });

  await assert.rejects(
    () => __test__.saveScoredArticles([createArticle()], supabase),
    /Supabase legacy fallback failed: permission denied/
  );
});
