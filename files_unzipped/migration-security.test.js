import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("./supabase-migration-v2.sql", import.meta.url),
  "utf8"
);

function createPolicyBodies(sql) {
  return [...sql.matchAll(/CREATE POLICY\s+"([^"]+)"\s+ON\s+([^\s]+)([\s\S]*?);/g)].map(
    ([, name, table, body]) => ({
      name,
      table,
      body,
    })
  );
}

test("internal curation tables only grant access to service_role", () => {
  for (const table of ["daily_ai_curations_v2", "monthly_learning_reports"]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated;`)
    );
    assert.match(
      migration,
      new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${table} TO service_role;`)
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`GRANT [^;]+ ON TABLE ${table} TO (anon|authenticated);`)
    );
  }
});

test("RLS policies do not expose tables to public roles", () => {
  const policies = createPolicyBodies(migration);
  assert.ok(
    policies.some(
      (policy) =>
        policy.table === "daily_ai_curations_v2" &&
        policy.body.includes("FOR ALL TO service_role")
    )
  );
  assert.ok(
    policies.some(
      (policy) =>
        policy.table === "monthly_learning_reports" &&
        policy.body.includes("FOR ALL TO service_role")
    )
  );

  for (const policy of policies) {
    assert.doesNotMatch(policy.body, /TO\s+(anon|authenticated|PUBLIC)\b/i);
    assert.doesNotMatch(policy.name, /^allow_(select|insert)/);
  }
});

test("monthly analysis views are not readable by public API roles", () => {
  const views = [
    "monthly_learning_summary",
    "risk_factor_analysis",
    "implementation_analysis",
    "confidence_distribution",
  ];

  for (const view of views) {
    assert.match(
      migration,
      new RegExp(`ALTER VIEW ${view} SET \\(security_invoker = true\\);`)
    );
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON ${view} FROM anon, authenticated;`)
    );
    assert.match(migration, new RegExp(`GRANT SELECT ON ${view} TO service_role;`));
    assert.doesNotMatch(
      migration,
      new RegExp(`GRANT SELECT ON ${view} TO (anon|authenticated|PUBLIC);`)
    );
  }
});
