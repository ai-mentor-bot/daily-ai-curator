import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

test("internal curation tables do not allow broad public RLS access", () => {
  assert.doesNotMatch(migrationSql, /FOR\s+SELECT\s+USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migrationSql, /FOR\s+INSERT\s+WITH\s+CHECK\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migrationSql, /USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migrationSql, /WITH\s+CHECK\s*\(\s*true\s*\)/i);
});

test("internal curation tables are restricted to service role", () => {
  assert.match(
    migrationSql,
    /CREATE\s+POLICY\s+"service_role_all_v2"[\s\S]*?FOR\s+ALL\s+TO\s+service_role[\s\S]*?WITH\s+CHECK\s*\(\s*auth\.role\(\)\s*=\s*'service_role'\s*\)/i
  );
  assert.match(
    migrationSql,
    /CREATE\s+POLICY\s+"service_role_all_monthly_reports"[\s\S]*?FOR\s+ALL\s+TO\s+service_role[\s\S]*?WITH\s+CHECK\s*\(\s*auth\.role\(\)\s*=\s*'service_role'\s*\)/i
  );
  assert.match(
    migrationSql,
    /REVOKE\s+ALL\s+ON\s+TABLE\s+daily_ai_curations_v2\s+FROM\s+anon,\s*authenticated/i
  );
  assert.match(
    migrationSql,
    /REVOKE\s+ALL\s+ON\s+TABLE\s+monthly_learning_reports\s+FROM\s+anon,\s*authenticated/i
  );
});

test("learning analysis views are not exposed to anon or authenticated roles", () => {
  const viewNames = [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ];

  for (const viewName of viewNames) {
    assert.match(
      migrationSql,
      new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE[\\s\\S]*${viewName}[\\s\\S]*FROM\\s+anon,\\s*authenticated`, "i")
    );
    assert.match(
      migrationSql,
      new RegExp(`GRANT\\s+SELECT\\s+ON\\s+TABLE[\\s\\S]*${viewName}[\\s\\S]*TO\\s+service_role`, "i")
    );
  }
});
