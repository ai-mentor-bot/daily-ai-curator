import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

test("internal curation tables do not allow public RLS access", () => {
  assert.doesNotMatch(migration, /FOR\s+SELECT\s+USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migration, /FOR\s+INSERT\s+WITH\s+CHECK\s*\(\s*true\s*\)/i);

  for (const table of ["daily_ai_curations_v2", "monthly_learning_reports"]) {
    assert.match(
      migration,
      new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+${table}\\s+FROM\\s+anon,\\s*authenticated`, "i"),
      `${table} must revoke anon/authenticated privileges`,
    );
    assert.match(
      migration,
      new RegExp(`GRANT\\s+SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE\\s+ON\\s+TABLE\\s+${table}\\s+TO\\s+service_role`, "i"),
      `${table} must grant writes only to service_role`,
    );
    assert.match(
      migration,
      new RegExp(`CREATE\\s+POLICY\\s+"service_role_select[^"]*"\\s+ON\\s+${table}[\\s\\S]*?FOR\\s+SELECT\\s+TO\\s+service_role[\\s\\S]*?auth\\.role\\(\\)\\s*=\\s*'service_role'`, "i"),
      `${table} select policy must be service-role-only`,
    );
    assert.match(
      migration,
      new RegExp(`CREATE\\s+POLICY\\s+"service_role_insert[^"]*"\\s+ON\\s+${table}[\\s\\S]*?FOR\\s+INSERT\\s+TO\\s+service_role[\\s\\S]*?auth\\.role\\(\\)\\s*=\\s*'service_role'`, "i"),
      `${table} insert policy must be service-role-only`,
    );
  }
});

test("analysis views are not exposed to anon or authenticated clients", () => {
  for (const view of [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+${view}\\s+FROM\\s+anon,\\s*authenticated`, "i"),
      `${view} must revoke anon/authenticated privileges`,
    );
    assert.match(
      migration,
      new RegExp(`GRANT\\s+SELECT\\s+ON\\s+TABLE\\s+${view}\\s+TO\\s+service_role`, "i"),
      `${view} must grant reads only to service_role`,
    );
  }
});
