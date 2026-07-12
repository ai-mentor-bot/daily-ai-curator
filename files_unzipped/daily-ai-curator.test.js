import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_KEY = "test-key";

const {
  saveScoredArticles,
  normalizeScore,
  notifyLineWithConfidence,
  getMostCommonRisk,
} = await import("./daily-ai-curator.js");

function article(overrides = {}) {
  return {
    article_title: "AI Sales Automation",
    article_url: "https://example.com/article",
    category: "CloserAI",
    total_score: 91,
    axis_breakdown: {
      adoption_score: 23,
      revenue_score: 22,
      scalability_score: 24,
      compatibility_score: 22,
    },
    confidence: 0.86,
    applicable_business: ["CloserAI"],
    risk_factors: ["integration risk"],
    thinking_summary: "summary",
    thinking_process: "thinking",
    implementation_complexity: "MEDIUM",
    priority: "HIGH",
    ...overrides,
  };
}

function createSupabaseMock(handler) {
  const calls = [];
  return {
    calls,
    client: {
      from(table) {
        return {
          async insert(rows) {
            calls.push({ table, rows });
            return handler(table, rows);
          },
        };
      },
    },
  };
}

test("saveScoredArticles saves rows independently and skips only duplicate v2 rows", async () => {
  const duplicateUrl = "https://example.com/duplicate";
  const { client, calls } = createSupabaseMock((table, rows) => {
    if (table === "daily_ai_curations_v2" && rows[0].url === duplicateUrl) {
      return {
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
        },
      };
    }
    return { error: null };
  });

  const result = await saveScoredArticles(
    [
      article({ article_url: duplicateUrl }),
      article({ article_url: "https://example.com/new" }),
    ],
    client
  );

  assert.deepEqual(result, {
    saved: 1,
    skippedDuplicates: 1,
    fallbackSaved: 0,
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((call) => call.table),
    ["daily_ai_curations_v2", "daily_ai_curations_v2"]
  );
});

test("saveScoredArticles throws when both v2 and v1 persistence fail", async () => {
  const { client, calls } = createSupabaseMock((table) => {
    if (table === "daily_ai_curations_v2") {
      return { error: { code: "42P01", message: "relation does not exist" } };
    }
    return { error: { code: "42501", message: "permission denied" } };
  });

  await assert.rejects(
    () => saveScoredArticles([article()], client),
    /Supabase save failed.*relation does not exist.*permission denied/
  );
  assert.deepEqual(
    calls.map((call) => call.table),
    ["daily_ai_curations_v2", "daily_ai_curations"]
  );
});

test("normalizeScore converts malformed scorer fields into safe storage and notification shapes", () => {
  const normalized = normalizeScore(
    {
      total_score: "88",
      confidence: "not-a-number",
      applicable_business: "CloserAI",
      risk_factors: null,
      implementation_complexity: "IMPOSSIBLE",
      priority: "URGENT",
      axis_breakdown: {
        adoption_score: "21",
      },
    },
    {
      title: "Partial scorer payload",
      url: "https://example.com/partial",
      searchQuery: { category: "AIメンター" },
    },
    "thinking text",
    "thinking summary"
  );

  assert.equal(normalized.total_score, 88);
  assert.equal(normalized.confidence, 0);
  assert.deepEqual(normalized.applicable_business, ["CloserAI"]);
  assert.deepEqual(normalized.risk_factors, []);
  assert.equal(normalized.implementation_complexity, "MEDIUM");
  assert.equal(normalized.priority, "MEDIUM");
  assert.equal(normalized.axis_breakdown.adoption_score, 21);
});

test("LINE notification and monthly risk logging tolerate partial array fields", async () => {
  delete process.env.LINE_MESSAGING_API_TOKEN;
  delete process.env.LINE_USER_ID;

  await notifyLineWithConfidence([
    article({
      applicable_business: "CloserAI",
      risk_factors: null,
    }),
  ]);
  assert.equal(
    getMostCommonRisk([
      article({ risk_factors: "security" }),
      article({ risk_factors: ["security", "cost"] }),
    ]),
    "security"
  );
});

test("Supabase migration is service-role-only and URL uniqueness is day-scoped", () => {
  const migration = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "supabase-migration-v2.sql"),
    "utf8"
  );

  assert.match(migration, /DROP CONSTRAINT IF EXISTS daily_ai_curations_v2_url_key/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_unique_url_per_day/);
  assert.doesNotMatch(migration, /url TEXT UNIQUE/);
  assert.doesNotMatch(migration, /USING \(true\)/);
  assert.doesNotMatch(migration, /WITH CHECK \(true\)/);
  assert.match(migration, /REVOKE ALL ON daily_ai_curations_v2 FROM anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON monthly_learning_reports FROM anon, authenticated/);
  assert.match(migration, /GRANT SELECT, INSERT ON daily_ai_curations_v2 TO service_role/);
  assert.match(migration, /GRANT SELECT, INSERT ON monthly_learning_reports TO service_role/);
});
