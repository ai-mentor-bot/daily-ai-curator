import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ||= "test-anthropic-key";
process.env.SUPABASE_URL ||= "example.supabase.co";
process.env.SUPABASE_KEY ||= "test-supabase-key";
process.env.LINE_MESSAGING_API_TOKEN ||= "test-line-token";
process.env.LINE_USER_ID ||= "test-line-user";

const {
  getMostCommonRisk,
  normalizeScoredArticle,
  normalizeSupabaseUrl,
  saveScoredArticles,
  sendLineMessage,
} = await import("./daily-ai-curator.js");

function makeArticle(overrides = {}) {
  return normalizeScoredArticle({
    article_title: "Example article",
    article_url: "https://example.com/article",
    category: "CloserAI",
    total_score: 90,
    confidence: 0.92,
    axis_breakdown: {
      adoption_score: 23,
      revenue_score: 22,
      scalability_score: 21,
      compatibility_score: 20,
    },
    applicable_business: ["CloserAI"],
    risk_factors: ["Vendor lock-in"],
    implementation_complexity: "LOW",
    priority: "HIGH",
    thinking_summary: "summary",
    thinking_process: "full thinking",
    ...overrides,
  });
}

function createFakeSupabase({ upsertErrors = [], insertError = null } = {}) {
  const calls = [];
  let upsertIndex = 0;

  return {
    calls,
    client: {
      from(table) {
        return {
          async upsert(row, options) {
            calls.push({ method: "upsert", table, row, options });
            const configuredError = Array.isArray(upsertErrors)
              ? upsertErrors[upsertIndex]
              : upsertErrors(row, upsertIndex);
            upsertIndex += 1;
            return { error: configuredError || null };
          },
          async insert(rows) {
            calls.push({ method: "insert", table, rows });
            return { error: insertError };
          },
        };
      },
    },
  };
}

test("normalizes malformed scorer arrays before downstream use", () => {
  const article = makeArticle({
    total_score: "91",
    confidence: "0.81",
    applicable_business: "AIメンター",
    risk_factors: null,
    axis_breakdown: null,
    implementation_complexity: "UNKNOWN",
    priority: undefined,
  });

  assert.equal(article.total_score, 91);
  assert.equal(article.confidence, 0.81);
  assert.deepEqual(article.applicable_business, ["AIメンター"]);
  assert.deepEqual(article.risk_factors, []);
  assert.equal(article.axis_breakdown.adoption_score, 0);
  assert.equal(article.implementation_complexity, "MEDIUM");
  assert.equal(article.priority, "HIGH");
  assert.equal(getMostCommonRisk([article]), "None identified");
});

test("normalizes bare Supabase hostnames for scheduled runs", () => {
  assert.equal(
    normalizeSupabaseUrl("example.supabase.co"),
    "https://example.supabase.co"
  );
  assert.equal(
    normalizeSupabaseUrl("https://example.supabase.co"),
    "https://example.supabase.co"
  );
});

test("saves each article independently and falls back only failed v2 rows", async () => {
  const first = makeArticle({ article_title: "First" });
  const second = makeArticle({
    article_title: "Second",
    article_url: "https://example.com/second",
  });
  const fake = createFakeSupabase({
    upsertErrors: [{ message: "duplicate title for today" }, null],
  });

  await saveScoredArticles([first, second], fake.client);

  const upserts = fake.calls.filter((call) => call.method === "upsert");
  assert.equal(upserts.length, 2);
  assert.deepEqual(upserts[0].options, {
    onConflict: "url",
    ignoreDuplicates: true,
  });

  const fallback = fake.calls.find((call) => call.method === "insert");
  assert.equal(fallback.table, "daily_ai_curations");
  assert.equal(fallback.rows.length, 1);
  assert.equal(fallback.rows[0].title, "First");
});

test("throws when v2 save and checked legacy fallback both fail", async () => {
  const fake = createFakeSupabase({
    upsertErrors: [{ message: "RLS denied" }],
    insertError: { message: "legacy permission denied" },
  });

  await assert.rejects(
    () => saveScoredArticles([makeArticle()], fake.client),
    /legacy fallback failed: legacy permission denied/
  );
});

test("LINE non-2xx responses fail instead of logging success", async () => {
  await assert.rejects(
    () =>
      sendLineMessage("hello", async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "bad token",
      })),
    /LINE API error 401 Unauthorized: bad token/
  );
});

test("Supabase migration keeps internal tables and learning views service-role-only", async () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const sql = await readFile(join(__dirname, "supabase-migration-v2.sql"), "utf8");

  assert.match(sql, /REVOKE ALL ON TABLE daily_ai_curations_v2 FROM anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON TABLE monthly_learning_reports FROM anon, authenticated;/);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE daily_ai_curations_v2 TO service_role;/);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE monthly_learning_reports TO service_role;/);
  assert.match(sql, /REVOKE ALL ON TABLE monthly_learning_summary FROM anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON TABLE risk_factor_analysis FROM anon, authenticated;/);
  assert.doesNotMatch(sql, /CREATE POLICY "allow_select_v2"[\s\S]*USING \(true\);/);
  assert.doesNotMatch(sql, /CREATE POLICY "allow_insert_v2"[\s\S]*WITH CHECK \(true\);/);
});
