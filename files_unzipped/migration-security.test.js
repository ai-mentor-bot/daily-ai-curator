import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
  new URL("./supabase-migration-v2.sql", import.meta.url),
  "utf8"
);

test("internal curation tables do not grant public RLS access", () => {
  assert.doesNotMatch(migrationSql, /USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migrationSql, /WITH\s+CHECK\s*\(\s*true\s*\)/i);

  for (const table of [
    "daily_ai_curations_v2",
    "monthly_learning_reports",
  ]) {
    assert.match(
      migrationSql,
      new RegExp(
        `CREATE POLICY "service_role_select_[^"]+" ON ${table}[\\s\\S]*?FOR SELECT USING \\(auth\\.role\\(\\) = 'service_role'\\);`,
        "i"
      )
    );
    assert.match(
      migrationSql,
      new RegExp(
        `CREATE POLICY "service_role_insert_[^"]+" ON ${table}[\\s\\S]*?FOR INSERT WITH CHECK \\(auth\\.role\\(\\) = 'service_role'\\);`,
        "i"
      )
    );
    assert.match(
      migrationSql,
      new RegExp(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated;`, "i")
    );
    assert.match(
      migrationSql,
      new RegExp(
        `GRANT SELECT, INSERT ON TABLE ${table} TO service_role;`,
        "i"
      )
    );
  }
});

test("analysis views are not exposed to anon or authenticated roles", () => {
  for (const view of [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ]) {
    assert.match(
      migrationSql,
      new RegExp(`REVOKE ALL ON TABLE ${view} FROM anon, authenticated;`, "i")
    );
    assert.match(
      migrationSql,
      new RegExp(`GRANT SELECT ON TABLE ${view} TO service_role;`, "i")
    );
  }
});
