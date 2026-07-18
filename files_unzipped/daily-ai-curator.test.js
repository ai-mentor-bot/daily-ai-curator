import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";

const { saveScoredArticles } = await import("./daily-ai-curator.js");

function article(overrides = {}) {
  return {
    article_title: "Example article",
    article_url: "https://example.com/article",
    category: "CloserAI",
    total_score: 90,
    axis_breakdown: {},
    confidence: 0.9,
    applicable_business: [],
    risk_factors: [],
    thinking_summary: "",
    thinking_process: "",
    implementation_complexity: "LOW",
    priority: "HIGH",
    ...overrides,
  };
}

function fakeClient(responses) {
  const calls = [];

  return {
    calls,
    from(table) {
      return {
        async insert(row) {
          calls.push({ table, row });
          return responses.shift() ?? { error: null };
        },
      };
    },
  };
}

test("a duplicate row does not roll back later articles", async () => {
  const client = fakeClient([
    { error: { code: "23505", message: "duplicate key" } },
    { error: null },
  ]);
  const second = article({
    article_title: "New article",
    article_url: "https://example.com/new",
  });

  const saved = await saveScoredArticles([article(), second], client);

  assert.deepEqual(saved, [second]);
  assert.deepEqual(
    client.calls.map((call) => call.table),
    ["daily_ai_curations_v2", "daily_ai_curations_v2"]
  );
});

test("a failed legacy fallback is surfaced instead of reporting success", async () => {
  const client = fakeClient([
    { error: { code: "42P01", message: "v2 table missing" } },
    { error: { code: "42501", message: "v1 permission denied" } },
  ]);

  await assert.rejects(
    saveScoredArticles([article()], client),
    /v2 table missing.*v1 permission denied/
  );
});

test("migration restricts reports and uses day-scoped URL uniqueness", async () => {
  const migration = await readFile(
    new URL("./supabase-migration-v2.sql", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(migration, /(?:USING|WITH CHECK)\s*\(\s*true\s*\)/i);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE daily_ai_curations_v2 FROM anon, authenticated/
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE monthly_learning_reports FROM anon, authenticated/
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_unique_url_per_day[\s\S]*\(url, \(\(saved_at::date\)\)\)/
  );
  assert.doesNotMatch(migration, /url TEXT UNIQUE/);
});
