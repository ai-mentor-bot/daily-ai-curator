import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationSql = readFileSync(
  new URL("./supabase-migration-v2.sql", import.meta.url),
  "utf8"
);

function policySql(policyName, tableName) {
  const pattern = new RegExp(
    `CREATE\\s+POLICY\\s+"${policyName}"\\s+ON\\s+${tableName}\\s+([\\s\\S]*?);`,
    "i"
  );
  const match = migrationSql.match(pattern);
  assert.ok(match, `Missing policy ${policyName} on ${tableName}`);
  return match[1].replace(/\s+/g, " ").trim();
}

function assertServiceRoleOnly(policyName, tableName, expectedCommand) {
  const sql = policySql(policyName, tableName);

  assert.match(
    sql,
    new RegExp(`FOR ${expectedCommand} TO service_role`, "i"),
    `${policyName} must be scoped to the service_role`
  );
  assert.doesNotMatch(
    sql,
    /\b(?:USING|WITH CHECK)\s*\(\s*true\s*\)/i,
    `${policyName} must not allow every Supabase role`
  );
  assert.match(
    sql,
    /auth\.role\(\)\s*=\s*'service_role'/i,
    `${policyName} must check the request role`
  );
}

assertServiceRoleOnly(
  "allow_select_v2",
  "daily_ai_curations_v2",
  "SELECT"
);
assertServiceRoleOnly(
  "allow_insert_v2",
  "daily_ai_curations_v2",
  "INSERT"
);
assertServiceRoleOnly(
  "allow_select_monthly_reports",
  "monthly_learning_reports",
  "SELECT"
);
assertServiceRoleOnly(
  "allow_insert_monthly_reports",
  "monthly_learning_reports",
  "INSERT"
);

console.log("Migration RLS policies are restricted to service_role.");
