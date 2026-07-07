import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

test("internal curation tables do not grant broad public RLS access", () => {
  assert.doesNotMatch(sql, /CREATE POLICY "allow_select_v2"[\s\S]*?USING \(true\);/);
  assert.doesNotMatch(sql, /CREATE POLICY "allow_insert_v2"[\s\S]*?WITH CHECK \(true\);/);
  assert.doesNotMatch(
    sql,
    /CREATE POLICY "allow_select_monthly_reports"[\s\S]*?USING \(true\);/
  );
  assert.doesNotMatch(
    sql,
    /CREATE POLICY "allow_insert_monthly_reports"[\s\S]*?WITH CHECK \(true\);/
  );
});

test("internal curation tables are restricted to service role", () => {
  for (const table of ["daily_ai_curations_v2", "monthly_learning_reports"]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE ${table} FROM PUBLIC;`));
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated;`));
    assert.match(sql, new RegExp(`GRANT SELECT, INSERT ON TABLE ${table} TO service_role;`));
  }

  assert.match(
    sql,
    /CREATE POLICY "service_role_select_v2"[\s\S]*?FOR SELECT TO service_role[\s\S]*?auth\.role\(\) = 'service_role'/
  );
  assert.match(
    sql,
    /CREATE POLICY "service_role_insert_v2"[\s\S]*?FOR INSERT TO service_role[\s\S]*?auth\.role\(\) = 'service_role'/
  );
  assert.match(
    sql,
    /CREATE POLICY "service_role_select_monthly_reports"[\s\S]*?FOR SELECT TO service_role[\s\S]*?auth\.role\(\) = 'service_role'/
  );
  assert.match(
    sql,
    /CREATE POLICY "service_role_insert_monthly_reports"[\s\S]*?FOR INSERT TO service_role[\s\S]*?auth\.role\(\) = 'service_role'/
  );
});

test("learning analysis views are not readable by public Supabase roles", () => {
  for (const view of [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE ${view} FROM PUBLIC;`));
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE ${view} FROM anon, authenticated;`));
    assert.match(sql, new RegExp(`GRANT SELECT ON TABLE ${view} TO service_role;`));
  }
});
