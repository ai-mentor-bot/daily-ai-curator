import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

test("internal curator tables are not exposed through public RLS policies", () => {
  assert.doesNotMatch(migration, /CREATE POLICY\s+"allow_select_v2"[\s\S]*USING\s*\(true\)/);
  assert.doesNotMatch(migration, /CREATE POLICY\s+"allow_insert_v2"[\s\S]*WITH CHECK\s*\(true\)/);
  assert.doesNotMatch(
    migration,
    /CREATE POLICY\s+"allow_select_monthly_reports"[\s\S]*USING\s*\(true\)/
  );
  assert.doesNotMatch(
    migration,
    /CREATE POLICY\s+"allow_insert_monthly_reports"[\s\S]*WITH CHECK\s*\(true\)/
  );
  assert.match(migration, /REVOKE ALL ON daily_ai_curations_v2 FROM anon, authenticated;/);
  assert.match(migration, /REVOKE ALL ON monthly_learning_reports FROM anon, authenticated;/);
});

test("curation URL uniqueness is scoped per saved day", () => {
  assert.doesNotMatch(migration, /url TEXT UNIQUE/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_unique_url_per_day\s+ON daily_ai_curations_v2 \(url, \(\(saved_at::date\)\)\)/
  );
  assert.match(
    migration,
    /ALTER TABLE daily_ai_curations_v2 DROP CONSTRAINT IF EXISTS daily_ai_curations_v2_url_key;/
  );
});

test("analytics views are not granted to public API roles", () => {
  for (const view of [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON ${view} FROM anon, authenticated;`)
    );
  }
});
