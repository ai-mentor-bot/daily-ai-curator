import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
  new URL("./supabase-migration-v2.sql", import.meta.url),
  "utf8"
);

const INTERNAL_TABLES = [
  "daily_ai_curations_v2",
  "monthly_learning_reports",
];

function policyStatementFor(policyName, tableName) {
  const escapedPolicyName = policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migrationSql.match(
    new RegExp(
      `CREATE\\s+POLICY\\s+"${escapedPolicyName}"\\s+ON\\s+${escapedTableName}\\s+([\\s\\S]*?);`,
      "i"
    )
  );

  assert.ok(match, `Expected policy "${policyName}" on ${tableName}`);
  return match[1].replace(/\s+/g, " ").trim().toUpperCase();
}

test("internal report tables only allow service role access", () => {
  const expectedPolicies = [
    ["allow_service_role_select_v2", "daily_ai_curations_v2", "FOR SELECT TO SERVICE_ROLE USING (TRUE)"],
    ["allow_service_role_insert_v2", "daily_ai_curations_v2", "FOR INSERT TO SERVICE_ROLE WITH CHECK (TRUE)"],
    [
      "allow_service_role_select_monthly_reports",
      "monthly_learning_reports",
      "FOR SELECT TO SERVICE_ROLE USING (TRUE)",
    ],
    [
      "allow_service_role_insert_monthly_reports",
      "monthly_learning_reports",
      "FOR INSERT TO SERVICE_ROLE WITH CHECK (TRUE)",
    ],
  ];

  for (const [policyName, tableName, expectedClause] of expectedPolicies) {
    assert.equal(policyStatementFor(policyName, tableName), expectedClause);
  }
});

test("migration removes previously broad public policies", () => {
  for (const tableName of INTERNAL_TABLES) {
    assert.match(
      migrationSql,
      new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"allow_insert.*"\\s+ON\\s+${tableName}`, "i"),
      `Expected migration to drop old broad insert policy on ${tableName}`
    );
  }

  const activePolicyStatements = migrationSql
    .match(/CREATE\s+POLICY[\s\S]*?;/gi)
    ?.filter((statement) =>
      INTERNAL_TABLES.some((tableName) =>
        new RegExp(`\\bON\\s+${tableName}\\b`, "i").test(statement)
      )
    ) ?? [];

  assert.ok(activePolicyStatements.length > 0, "Expected internal table policies");

  for (const statement of activePolicyStatements) {
    assert.doesNotMatch(
      statement,
      /FOR\s+INSERT\s+WITH\s+CHECK\s*\(\s*true\s*\)/i,
      "Internal tables must not allow public inserts"
    );
    assert.doesNotMatch(
      statement,
      /FOR\s+SELECT\s+USING\s*\(\s*true\s*\)/i,
      "Internal tables must not allow public reads"
    );
  }
});
