import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8")
  .replace(/\s+/g, " ")
  .toLowerCase();

const sensitiveTables = [
  "daily_ai_curations_v2",
  "monthly_learning_reports",
];

const internalViews = [
  "monthly_learning_summary",
  "risk_factor_analysis",
  "implementation_analysis",
  "confidence_distribution",
];

test("sensitive tables only expose RLS policies to service_role", () => {
  for (const table of sensitiveTables) {
    assert.match(
      migration,
      new RegExp(`create policy "[^"]+" on ${table} for select to service_role using \\(true\\)`),
      `${table} select policy must be service_role-only`,
    );
    assert.match(
      migration,
      new RegExp(`create policy "[^"]+" on ${table} for insert to service_role with check \\(true\\)`),
      `${table} insert policy must be service_role-only`,
    );
  }
});

test("sensitive tables revoke anon and authenticated direct access", () => {
  for (const table of sensitiveTables) {
    assert.match(
      migration,
      new RegExp(`revoke all on table ${table} from anon, authenticated`),
      `${table} must revoke anon/authenticated privileges`,
    );
    assert.match(
      migration,
      new RegExp(`grant select, insert, update, delete on table ${table} to service_role`),
      `${table} must grant backend service-role access`,
    );
  }
});

test("internal analytics views are not exposed to anon or authenticated roles", () => {
  for (const view of internalViews) {
    assert.match(
      migration,
      new RegExp(`revoke all on table ${view} from anon, authenticated`),
      `${view} must revoke anon/authenticated privileges`,
    );
    assert.match(
      migration,
      new RegExp(`grant select on table ${view} to service_role`),
      `${view} must grant service-role read access`,
    );
  }
});
