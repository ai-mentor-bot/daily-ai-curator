import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationSql = readFileSync(
  new URL("./supabase-migration-v2.sql", import.meta.url),
  "utf8"
);

const writableInternalTables = [
  "daily_ai_curations_v2",
  "monthly_learning_reports",
];

for (const tableName of writableInternalTables) {
  const insertPolicyPattern = new RegExp(
    `CREATE\\s+POLICY[\\s\\S]+?ON\\s+${tableName}\\b[\\s\\S]+?FOR\\s+INSERT`,
    "i"
  );

  assert.equal(
    insertPolicyPattern.test(migrationSql),
    false,
    `${tableName} must not expose INSERT through RLS policies`
  );
}

assert.doesNotMatch(
  migrationSql,
  /FOR\s+INSERT[\s\S]+?WITH\s+CHECK\s*\(\s*true\s*\)/i,
  "Unrestricted INSERT policies allow public clients to corrupt internal data"
);
