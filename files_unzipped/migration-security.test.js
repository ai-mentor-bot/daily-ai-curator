import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

test("internal Supabase tables do not allow public read or insert policies", () => {
  assert.doesNotMatch(sql, /CREATE POLICY "allow_select_v2"/);
  assert.doesNotMatch(sql, /CREATE POLICY "allow_insert_v2"/);
  assert.doesNotMatch(sql, /CREATE POLICY "allow_select_monthly_reports"/);
  assert.doesNotMatch(sql, /CREATE POLICY "allow_insert_monthly_reports"/);

  assert.doesNotMatch(sql, /FOR SELECT\s+USING\s*\(true\)/i);
  assert.doesNotMatch(sql, /FOR INSERT\s+WITH CHECK\s*\(true\)/i);
});

test("internal Supabase tables are restricted to service_role", () => {
  assert.match(
    sql,
    /CREATE POLICY "service_role_select_v2" ON daily_ai_curations_v2\s+FOR SELECT TO service_role USING \(true\);/i
  );
  assert.match(
    sql,
    /CREATE POLICY "service_role_insert_v2" ON daily_ai_curations_v2\s+FOR INSERT TO service_role WITH CHECK \(true\);/i
  );
  assert.match(
    sql,
    /CREATE POLICY "service_role_select_monthly_reports" ON monthly_learning_reports\s+FOR SELECT TO service_role USING \(true\);/i
  );
  assert.match(
    sql,
    /CREATE POLICY "service_role_insert_monthly_reports" ON monthly_learning_reports\s+FOR INSERT TO service_role WITH CHECK \(true\);/i
  );

  assert.match(sql, /REVOKE ALL ON TABLE daily_ai_curations_v2 FROM anon, authenticated;/i);
  assert.match(sql, /REVOKE ALL ON TABLE monthly_learning_reports FROM anon, authenticated;/i);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE daily_ai_curations_v2 TO service_role;/i);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE monthly_learning_reports TO service_role;/i);
});

test("analysis views are not granted to anon or authenticated roles", () => {
  for (const viewName of [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON TABLE ${viewName} FROM anon, authenticated;`, "i")
    );
    assert.match(sql, new RegExp(`GRANT SELECT ON TABLE ${viewName} TO service_role;`, "i"));
  }
});
