import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_KEY = "test-supabase-key";

const { isDuplicateSupabaseError, saveScoredArticles } = await import(
  "./daily-ai-curator.js"
);

function makeArticle(overrides = {}) {
  return {
    article_title: "Useful AI case study",
    article_url: "https://example.com/case-study",
    category: "CloserAI",
    total_score: 91,
    axis_breakdown: {
      adoption_score: 24,
      revenue_score: 23,
      scalability_score: 22,
      compatibility_score: 22,
    },
    confidence: 0.88,
    applicable_business: ["CloserAI"],
    risk_factors: ["integration effort"],
    thinking_summary: "Strong fit",
    thinking_process: "Detailed reasoning",
    implementation_complexity: "LOW",
    priority: "HIGH",
    ...overrides,
  };
}

function makeSupabaseMock(handler) {
  const calls = [];

  return {
    calls,
    from(tableName) {
      return {
        async insert(records) {
          calls.push({ tableName, records });
          return handler(tableName, records);
        },
      };
    },
  };
}

test("detects duplicate Supabase errors by code and message", () => {
  assert.equal(isDuplicateSupabaseError({ code: "23505" }), true);
  assert.equal(
    isDuplicateSupabaseError({
      message: "duplicate key value violates unique constraint",
    }),
    true
  );
  assert.equal(isDuplicateSupabaseError({ code: "42P01" }), false);
});

test("continues saving later rows when one v2 row is a duplicate", async () => {
  const duplicateUrl = "https://example.com/already-saved";
  const supabase = makeSupabaseMock((tableName, records) => {
    assert.equal(tableName, "daily_ai_curations_v2");
    if (records[0].url === duplicateUrl) {
      return { error: { code: "23505", message: "duplicate key value" } };
    }
    return { error: null };
  });

  const result = await saveScoredArticles(
    [
      makeArticle({ article_url: duplicateUrl }),
      makeArticle({ article_url: "https://example.com/new-article" }),
    ],
    supabase
  );

  assert.deepEqual(result, { saved: 1, skippedDuplicates: 1 });
  assert.equal(supabase.calls.length, 2);
  assert.equal(
    supabase.calls.every((call) => call.tableName === "daily_ai_curations_v2"),
    true
  );
});

test("falls back per article and checks legacy insert failures", async () => {
  const supabase = makeSupabaseMock((tableName) => {
    if (tableName === "daily_ai_curations_v2") {
      return { error: { code: "42P01", message: "relation does not exist" } };
    }
    return { error: null };
  });

  const result = await saveScoredArticles([makeArticle()], supabase);

  assert.deepEqual(result, { saved: 1, skippedDuplicates: 0 });
  assert.deepEqual(
    supabase.calls.map((call) => call.tableName),
    ["daily_ai_curations_v2", "daily_ai_curations"]
  );
});

test("throws when both v2 and legacy saves fail for a non-duplicate row", async () => {
  const supabase = makeSupabaseMock(() => ({
    error: { code: "42501", message: "permission denied" },
  }));

  await assert.rejects(
    () => saveScoredArticles([makeArticle()], supabase),
    /Failed to save article/
  );
});
