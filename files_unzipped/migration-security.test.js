import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("./supabase-migration-v2.sql", import.meta.url),
  "utf8",
);

const INTERNAL_TABLES = [
  "daily_ai_curations_v2",
  "monthly_learning_reports",
];

const LEARNING_VIEWS = [
  "monthly_learning_summary",
  "risk_factor_analysis",
  "implementation_analysis",
  "confidence_distribution",
];

test("internal report tables are restricted to the service role", () => {
  for (const table of INTERNAL_TABLES) {
    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY "service_role_select[^"]*" ON ${table}\\s+FOR SELECT TO service_role\\s+USING \\(auth\\.role\\(\\) = 'service_role'\\);`,
        "s",
      ),
      `${table} must only allow service-role reads`,
    );
    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY "service_role_insert[^"]*" ON ${table}\\s+FOR INSERT TO service_role\\s+WITH CHECK \\(auth\\.role\\(\\) = 'service_role'\\);`,
        "s",
      ),
      `${table} must only allow service-role writes`,
    );
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated;`),
      `${table} must revoke public Supabase roles`,
    );
  }
});

test("learning views are not exposed to public Supabase roles", () => {
  for (const view of LEARNING_VIEWS) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON TABLE ${view} FROM anon, authenticated;`),
      `${view} must revoke public Supabase roles`,
    );
    assert.match(
      migration,
      new RegExp(`GRANT SELECT ON TABLE ${view} TO service_role;`),
      `${view} should remain readable by the service role`,
    );
  }
});

test("migration does not create broad public report policies", () => {
  assert.doesNotMatch(
    migration,
    /FOR\s+(SELECT|INSERT)[\s\S]*?(USING|WITH CHECK)\s*\(true\)/i,
  );
  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[^;]+TO\s+(?:anon|authenticated)\b/i,
  );
});

test("curation URL uniqueness is scoped to each saved date", () => {
  assert.doesNotMatch(migration, /\burl\s+TEXT\s+UNIQUE\b/i);
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS daily_ai_curations_v2_url_key;/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_unique_url_per_day\s+ON daily_ai_curations_v2 \(url, saved_date\);/s,
  );
});
