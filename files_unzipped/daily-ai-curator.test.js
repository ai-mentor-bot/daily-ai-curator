import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ||= "test-api-key";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-supabase-key";

const { normalizeScoringResult, saveCurationsToSupabase } = await import(
  `./daily-ai-curator.js?test=${Date.now()}`
);

function scoredArticle(overrides = {}) {
  return {
    article_title: "Example AI rollout",
    article_url: "https://example.com/ai-rollout",
    category: "CloserAI",
    total_score: 92,
    axis_breakdown: {
      adoption_score: 24,
      revenue_score: 23,
      scalability_score: 22,
      compatibility_score: 23,
    },
    confidence: 0.91,
    applicable_business: ["CloserAI"],
    risk_factors: ["Vendor lock-in"],
    thinking_summary: "Strong deployment evidence",
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
        insert: async (payload) => {
          const call = { table, payload };
          calls.push(call);
          return insertHandler(call, calls.length - 1);
        },
      };
    },
  };
}

test("saveCurationsToSupabase skips duplicate v2 rows without losing new rows", async () => {
  const client = createMockSupabase((call, index) => {
    if (call.table === "daily_ai_curations_v2" && index === 0) {
      return {
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
        },
      };
    }
    return { error: null };
  });

  const result = await saveCurationsToSupabase(
    [
      scoredArticle({ article_url: "https://example.com/duplicate" }),
      scoredArticle({ article_url: "https://example.com/new" }),
    ],
    client
  );

  assert.deepEqual(result, { version: "v2", saved: 1, duplicates: 1 });
  assert.equal(
    client.calls.filter((call) => call.table === "daily_ai_curations_v2").length,
    2
  );
  assert.equal(
    client.calls.filter((call) => call.table === "daily_ai_curations").length,
    0
  );
});

test("saveCurationsToSupabase checks legacy fallback errors when v2 schema is missing", async () => {
  const client = createMockSupabase((call) => {
    if (call.table === "daily_ai_curations_v2") {
      return {
        error: {
          code: "42P01",
          message: 'relation "daily_ai_curations_v2" does not exist',
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
    () => saveCurationsToSupabase([scoredArticle()], client),
    /Supabase legacy save failed: permission denied/
  );
});

test("normalizeScoringResult tolerates malformed scorer arrays in notification path", () => {
  const normalized = normalizeScoringResult(
    {
      axis_breakdown: { adoption_score: "25" },
      total_score: "87",
      confidence: "0.8",
      applicable_business: "CloserAI",
      implementation_complexity: "UNKNOWN",
      priority: "URGENT",
    },
    {
      title: "Malformed scorer output",
      url: "https://example.com/malformed",
      searchQuery: { category: "AIメンター" },
    },
    "thinking"
  );

  assert.equal(normalized.total_score, 87);
  assert.deepEqual(normalized.applicable_business, ["CloserAI"]);
  assert.deepEqual(normalized.risk_factors, []);
  assert.equal(normalized.implementation_complexity, "MEDIUM");
  assert.equal(normalized.priority, "LOW");
});

test("Supabase migration restricts internal tables and views to service_role", () => {
  const sql = readFileSync(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

  assert.doesNotMatch(sql, /FOR SELECT\s+USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /FOR INSERT\s+WITH CHECK\s*\(\s*true\s*\)/i);

  for (const table of ["daily_ai_curations_v2", "monthly_learning_reports"]) {
    assert.match(
      sql,
      new RegExp(
        `CREATE POLICY "service_role_select[\\s\\S]*ON ${table}[\\s\\S]*FOR SELECT TO service_role USING \\(true\\)`,
        "i"
      )
    );
    assert.match(
      sql,
      new RegExp(
        `CREATE POLICY "service_role_insert[\\s\\S]*ON ${table}[\\s\\S]*FOR INSERT TO service_role WITH CHECK \\(true\\)`,
        "i"
      )
    );
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated;`, "i")
    );
  }

  for (const view of [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON TABLE ${view} FROM anon, authenticated;`, "i")
    );
    assert.match(sql, new RegExp(`GRANT SELECT ON TABLE ${view} TO service_role;`, "i"));
  }
});
