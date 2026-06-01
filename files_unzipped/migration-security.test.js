import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationSql = readFileSync(
  new URL("./supabase-migration-v2.sql", import.meta.url),
  "utf8"
);

test("internal report tables do not grant broad insert policies", () => {
  const insertPolicies = migrationSql.match(
    /CREATE\s+POLICY[\s\S]*?\bFOR\s+INSERT\b[\s\S]*?;/gi
  ) || [];

  assert.deepEqual(
    insertPolicies,
    [],
    "daily curator report tables must only be written by service-role server jobs"
  );
});

test("stale insert policies are removed when migration is rerun", () => {
  assert.match(
    migrationSql,
    /DROP\s+POLICY\s+IF\s+EXISTS\s+"allow_insert_v2"\s+ON\s+daily_ai_curations_v2;/i
  );
  assert.match(
    migrationSql,
    /DROP\s+POLICY\s+IF\s+EXISTS\s+"allow_insert_monthly_reports"\s+ON\s+monthly_learning_reports;/i
  );
});
