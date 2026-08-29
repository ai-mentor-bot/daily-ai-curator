import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
  new URL("./supabase-migration-v2.sql", import.meta.url),
  "utf8"
);

const insertPolicies = (tableName) =>
  (migrationSql.match(/CREATE\s+POLICY[\s\S]*?;/gi) || []).filter(
    (statement) =>
      new RegExp(`ON\\s+${tableName}\\b`, "i").test(statement) &&
      /\bFOR\s+INSERT\b/i.test(statement)
  );

test("internal report tables restrict inserts to the service role", () => {
  const internalTables = [
    "daily_ai_curations_v2",
    "monthly_learning_reports",
  ];

  for (const tableName of internalTables) {
    const policies = insertPolicies(tableName);

    assert.equal(
      policies.length,
      1,
      `${tableName} should have exactly one insert policy`
    );
    assert.match(
      policies[0],
      /\bTO\s+service_role\b/i,
      `${tableName} insert policy must be scoped to service_role`
    );
    assert.doesNotMatch(
      policies[0],
      /\bTO\s+(public|anon|authenticated)\b/i,
      `${tableName} insert policy must not allow client roles`
    );
  }
});

test("migration does not create broad public insert policies", () => {
  for (const policy of migrationSql.match(/CREATE\s+POLICY[\s\S]*?;/gi) || []) {
    if (!/\bFOR\s+INSERT\b/i.test(policy)) continue;

    assert.doesNotMatch(
      policy,
      /\bFOR\s+INSERT\s+WITH\s+CHECK\s*\(\s*true\s*\)/i,
      "insert policies must not omit an explicit role restriction"
    );
  }
});
