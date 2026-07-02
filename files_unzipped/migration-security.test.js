import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("./supabase-migration-v2.sql", import.meta.url),
  "utf8"
);

test("internal report tables are not exposed through public RLS policies", () => {
  assert.doesNotMatch(migration, /USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migration, /WITH\s+CHECK\s*\(\s*true\s*\)/i);

  assert.match(migration, /CREATE POLICY "service_role_all_v2"/);
  assert.match(migration, /CREATE POLICY "service_role_all_monthly_reports"/);
  assert.match(migration, /REVOKE ALL ON TABLE daily_ai_curations_v2 FROM anon, authenticated;/);
  assert.match(migration, /REVOKE ALL ON TABLE monthly_learning_reports FROM anon, authenticated;/);
});

test("learning views are only granted to the service role", () => {
  for (const viewName of [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON TABLE ${viewName} FROM anon, authenticated;`)
    );
    assert.match(migration, new RegExp(`GRANT SELECT ON TABLE ${viewName} TO service_role;`));
  }
});
