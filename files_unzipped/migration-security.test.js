import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

test("internal curation tables do not allow public RLS access", () => {
  assert.doesNotMatch(migrationSql, /USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migrationSql, /WITH CHECK\s*\(\s*true\s*\)/i);
  assert.match(migrationSql, /auth\.role\(\)\s*=\s*'service_role'/);
  assert.match(migrationSql, /REVOKE ALL ON TABLE daily_ai_curations_v2 FROM anon, authenticated;/);
  assert.match(migrationSql, /REVOKE ALL ON TABLE monthly_learning_reports FROM anon, authenticated;/);
});

test("learning views are restricted to the service role", () => {
  for (const viewName of [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ]) {
    assert.match(
      migrationSql,
      new RegExp(`REVOKE ALL ON TABLE ${viewName} FROM anon, authenticated;`)
    );
    assert.match(migrationSql, new RegExp(`GRANT SELECT ON TABLE ${viewName} TO service_role;`));
  }
});
