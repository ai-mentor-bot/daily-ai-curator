import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = "test-api-key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_KEY = "test-supabase-key";

const {
  buildV1CurationRow,
  buildV2CurationRow,
  formatLineConfidenceMessage,
  getMostCommonRisk,
  saveScoredArticles,
} = await import("./daily-ai-curator.js");

function createArticle(overrides = {}) {
  return {
    article_title: "AI sales automation case study",
    article_url: "https://example.com/article",
    category: "CloserAI",
    total_score: 91,
    axis_breakdown: {
      adoption_score: 24,
      revenue_score: 23,
      scalability_score: 22,
      compatibility_score: 22,
    },
    confidence: 0.87,
    applicable_business: ["CloserAI"],
    risk_factors: ["integration complexity"],
    thinking_summary: "Strong fit",
    thinking_process: "Detailed reasoning",
    implementation_complexity: "MEDIUM",
    priority: "HIGH",
    ...overrides,
  };
}

test("migration restricts curation writes to service_role", async () => {
  const sql = await readFile(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

  assert.match(sql, /CREATE POLICY "service_role_all_v2"[\s\S]*TO service_role/);
  assert.match(sql, /CREATE POLICY "service_role_all_monthly_reports"[\s\S]*TO service_role/);
  assert.doesNotMatch(sql, /FOR INSERT\s+WITH CHECK\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /FOR SELECT\s+USING\s*\(\s*true\s*\)/i);
});

test("LINE digest formatting tolerates missing array fields", () => {
  const message = formatLineConfidenceMessage([
    createArticle({
      applicable_business: undefined,
      risk_factors: undefined,
      confidence: undefined,
    }),
  ]);

  assert.match(message, /対象: 未分類/);
  assert.match(message, /リスク: なし/);
  assert.match(message, /確信度: 0%/);
});

test("row builders normalize optional arrays and fallback score details", () => {
  const article = createArticle({
    applicable_business: null,
    risk_factors: null,
    axis_breakdown: undefined,
  });

  assert.deepEqual(buildV2CurationRow(article, "2026-06-03T00:00:00.000Z"), {
    title: "AI sales automation case study",
    url: "https://example.com/article",
    category: "CloserAI",
    total_score: 91,
    breakdown: {},
    confidence: 0.87,
    applicable_business: [],
    risk_factors: [],
    thinking_summary: "Strong fit",
    thinking_process: "Detailed reasoning",
    implementation_complexity: "MEDIUM",
    priority: "HIGH",
    saved_at: "2026-06-03T00:00:00.000Z",
  });

  assert.deepEqual(buildV1CurationRow(article, "2026-06-03T00:00:00.000Z").breakdown, {
    adoption: null,
    revenue_speed: null,
    scalability: null,
    stack_compatibility: null,
  });
});

test("saveScoredArticles saves rows independently after a failed row", async () => {
  const calls = [];
  const client = {
    from(table) {
      return {
        async insert(rows) {
          calls.push({ table, rows });
          if (table === "daily_ai_curations_v2" && rows[0].title === "duplicate") {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          if (table === "daily_ai_curations") {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          return { error: null };
        },
      };
    },
  };

  const duplicate = createArticle({ article_title: "duplicate" });
  const valid = createArticle({ article_title: "valid", article_url: "https://example.com/valid" });

  const saved = await saveScoredArticles([duplicate, valid], client);

  assert.deepEqual(saved.map((article) => article.article_title), ["valid"]);
  assert.equal(calls.filter((call) => call.table === "daily_ai_curations_v2").length, 2);
  assert.equal(calls.filter((call) => call.table === "daily_ai_curations").length, 1);
});

test("saveScoredArticles fallback does not crash without axis_breakdown", async () => {
  const client = {
    from(table) {
      return {
        async insert() {
          return table === "daily_ai_curations_v2"
            ? { error: { code: "42P01", message: "missing table" } }
            : { error: null };
        },
      };
    },
  };

  const saved = await saveScoredArticles(
    [createArticle({ axis_breakdown: undefined })],
    client
  );

  assert.equal(saved.length, 1);
});

test("getMostCommonRisk ignores missing risk arrays", () => {
  assert.equal(
    getMostCommonRisk([
      createArticle({ risk_factors: undefined }),
      createArticle({ risk_factors: ["privacy", "privacy"] }),
    ]),
    "privacy"
  );
});
