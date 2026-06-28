import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || "test-key";

const {
  isDuplicateSupabaseError,
  isMissingRelationSupabaseError,
  normalizeScoredArticle,
  saveScoredArticles,
} = await import("./daily-ai-curator.js");

function createArticle(overrides = {}) {
  return {
    article_title: "AI sales automation case study",
    article_url: "https://example.com/article",
    category: "CloserAI",
    total_score: 91,
    axis_breakdown: {
      adoption_score: 23,
      revenue_score: 22,
      scalability_score: 23,
      compatibility_score: 23,
    },
    confidence: 0.86,
    applicable_business: ["CloserAI"],
    risk_factors: ["integration complexity"],
    thinking_summary: "Strong implementation fit",
    thinking_process: "Detailed reasoning",
    implementation_complexity: "MEDIUM",
    priority: "HIGH",
    ...overrides,
  };
}

function createFakeSupabase(responses) {
  const calls = [];

  return {
    calls,
    from(table) {
      return {
        async insert(rows) {
          calls.push({ table, rows });
          const response = responses.shift();
          assert.ok(response, `Unexpected insert into ${table}`);
          return response;
        },
      };
    },
  };
}

test("saveScoredArticles preserves non-duplicate rows when one insert conflicts", async () => {
  const duplicateError = {
    code: "23505",
    message: "duplicate key value violates unique constraint",
  };
  const supabase = createFakeSupabase([
    { error: duplicateError },
    { error: null },
    { error: null },
  ]);

  const result = await saveScoredArticles(supabase, [
    createArticle({ article_title: "Already saved" }),
    createArticle({
      article_title: "New article 1",
      article_url: "https://example.com/new-1",
    }),
    createArticle({
      article_title: "New article 2",
      article_url: "https://example.com/new-2",
    }),
  ]);

  assert.deepEqual(result, {
    savedCount: 2,
    skippedDuplicateCount: 1,
  });
  assert.equal(supabase.calls.length, 3);
  assert.deepEqual(
    supabase.calls.map((call) => call.table),
    [
      "daily_ai_curations_v2",
      "daily_ai_curations_v2",
      "daily_ai_curations_v2",
    ]
  );
});

test("saveScoredArticles throws when v2 and legacy fallback both fail", async () => {
  const supabase = createFakeSupabase([
    {
      error: {
        code: "PGRST204",
        message: "Could not find the daily_ai_curations_v2 table",
      },
    },
    {
      error: {
        code: "42501",
        message: "permission denied for table daily_ai_curations",
      },
    },
  ]);

  await assert.rejects(
    () => saveScoredArticles(supabase, [createArticle()]),
    /Failed to save 1 scored article/
  );
  assert.deepEqual(
    supabase.calls.map((call) => call.table),
    ["daily_ai_curations_v2", "daily_ai_curations"]
  );
});

test("saveScoredArticles does not route v2 schema violations to legacy", async () => {
  const supabase = createFakeSupabase([
    {
      error: {
        code: "23514",
        message: "new row violates check constraint",
      },
    },
  ]);

  await assert.rejects(
    () => saveScoredArticles(supabase, [createArticle()]),
    /Failed to save 1 scored article/
  );
  assert.deepEqual(
    supabase.calls.map((call) => call.table),
    ["daily_ai_curations_v2"]
  );
});

test("isDuplicateSupabaseError detects unique constraint failures", () => {
  assert.equal(isDuplicateSupabaseError({ code: "23505" }), true);
  assert.equal(
    isDuplicateSupabaseError({
      message: "duplicate key value violates unique constraint",
    }),
    true
  );
  assert.equal(isDuplicateSupabaseError({ code: "42501" }), false);
  assert.equal(isDuplicateSupabaseError(null), false);
});

test("isMissingRelationSupabaseError only detects missing table failures", () => {
  assert.equal(isMissingRelationSupabaseError({ code: "42P01" }), true);
  assert.equal(
    isMissingRelationSupabaseError({
      message: "Could not find the daily_ai_curations_v2 table in the schema cache",
    }),
    true
  );
  assert.equal(isMissingRelationSupabaseError({ code: "23514" }), false);
});

test("normalizeScoredArticle makes scorer arrays safe for notification", () => {
  const normalized = normalizeScoredArticle(
    {
      axis_breakdown: {
        adoption_score: 25,
        revenue_score: "22",
        scalability_score: 24,
        compatibility_score: 21,
      },
      total_score: "92.4",
      confidence: "0.88",
      applicable_business: "CloserAI",
      risk_factors: null,
      implementation_complexity: "UNKNOWN",
      priority: "INVALID",
    },
    {
      title: "Scored article",
      url: "https://example.com/scored",
      searchQuery: { category: "CloserAI" },
    },
    "thinking",
    "summary"
  );

  assert.equal(normalized.total_score, 92);
  assert.equal(normalized.confidence, 0.88);
  assert.deepEqual(normalized.applicable_business, ["CloserAI"]);
  assert.deepEqual(normalized.risk_factors, []);
  assert.equal(normalized.implementation_complexity, "MEDIUM");
  assert.equal(normalized.priority, "HIGH");
});
