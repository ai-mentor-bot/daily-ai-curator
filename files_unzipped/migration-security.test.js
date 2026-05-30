import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migrationSql = readFileSync(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");

test("internal report tables are restricted to service-role access", () => {
  const protectedTables = [
    "daily_ai_curations_v2",
    "monthly_learning_reports",
  ];

  for (const table of protectedTables) {
    const tablePolicySql = migrationSql.match(
      new RegExp(
        `ALTER TABLE\\s+${table}\\s+ENABLE ROW LEVEL SECURITY;([\\s\\S]*?)(?=-- ============================================)`,
        "i",
      ),
    )?.[1] || "";

    assert.match(
      tablePolicySql,
      /FOR\s+SELECT\s+TO\s+service_role\s+USING\s*\(\s*true\s*\)/i,
      `${table} must only allow service-role reads`,
    );
    assert.match(
      tablePolicySql,
      /FOR\s+INSERT\s+TO\s+service_role\s+WITH\s+CHECK\s*\(\s*true\s*\)/i,
      `${table} must only allow service-role writes`,
    );
    assert.doesNotMatch(
      tablePolicySql,
      /FOR\s+(SELECT|INSERT)(?!\s+TO\s+service_role)\b[\s\S]*?(USING|WITH\s+CHECK)\s*\(\s*true\s*\)/i,
      `${table} must not allow broad public read/write policies`,
    );
  }
});
