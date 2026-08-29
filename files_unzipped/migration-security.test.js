import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migrationSql = readFileSync(
  new URL("./supabase-migration-v2.sql", import.meta.url),
  "utf8"
);

test("internal report tables only allow service role inserts", () => {
  assert.match(
    migrationSql,
    /CREATE POLICY "allow_insert_v2" ON daily_ai_curations_v2\s+FOR INSERT TO service_role WITH CHECK \(true\);/
  );
  assert.match(
    migrationSql,
    /CREATE POLICY "allow_insert_monthly_reports" ON monthly_learning_reports\s+FOR INSERT TO service_role WITH CHECK \(true\);/
  );
  assert.doesNotMatch(migrationSql, /FOR INSERT WITH CHECK \(true\);/);
});
