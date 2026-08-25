import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  join(__dirname, "supabase-migration-v2.sql"),
  "utf8"
);

test("internal report tables do not grant public RLS access", () => {
  assert.doesNotMatch(migration, /FOR\s+SELECT\s+USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migration, /FOR\s+INSERT\s+WITH\s+CHECK\s*\(\s*true\s*\)/i);
  assert.match(migration, /FOR\s+ALL\s+TO\s+service_role/i);
  assert.match(migration, /auth\.role\(\)\s*=\s*'service_role'/i);
});

test("anon and authenticated roles are revoked from internal tables", () => {
  for (const tableName of [
    "daily_ai_curations_v2",
    "monthly_learning_reports",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE\\s+ALL\\s+ON\\s+${tableName}\\s+FROM\\s+PUBLIC,\\s*anon,\\s*authenticated`,
        "i"
      )
    );
    assert.match(
      migration,
      new RegExp(
        `GRANT\\s+SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE\\s+ON\\s+${tableName}\\s+TO\\s+service_role`,
        "i"
      )
    );
  }
});

test("analytic views run with invoker permissions and are service-role-only", () => {
  for (const viewName of [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `CREATE\\s+OR\\s+REPLACE\\s+VIEW\\s+${viewName}\\s+WITH\\s*\\(\\s*security_invoker\\s*=\\s*true\\s*\\)`,
        "i"
      )
    );
    assert.match(
      migration,
      new RegExp(
        `REVOKE\\s+ALL\\s+ON\\s+${viewName}\\s+FROM\\s+PUBLIC,\\s*anon,\\s*authenticated`,
        "i"
      )
    );
    assert.match(
      migration,
      new RegExp(`GRANT\\s+SELECT\\s+ON\\s+${viewName}\\s+TO\\s+service_role`, "i")
    );
  }
});
