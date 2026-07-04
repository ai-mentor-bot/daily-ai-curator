import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dailySource = readFileSync(new URL("./daily-ai-curator.js", import.meta.url), "utf8");
const migrationSql = readFileSync(new URL("./supabase-migration-v2.sql", import.meta.url), "utf8");
const workflowYaml = readFileSync(
  new URL("../.github/workflows/daily-curator.yml", import.meta.url),
  "utf8"
);

test("daily curator saves v2 rows independently and handles duplicates safely", () => {
  assert.match(
    dailySource,
    /\.from\("daily_ai_curations_v2"\)\s*\.upsert\(row,\s*\{\s*onConflict:\s*"url"\s*\}\)/s
  );
  assert.doesNotMatch(
    dailySource,
    /\.from\("daily_ai_curations_v2"\)\s*\.insert\(\s*scoredArticles\.map/s
  );
  assert.match(dailySource, /function isDuplicateError\(error\)/);
});

test("daily curator only falls back to v1 for a missing v2 table and surfaces failures", () => {
  assert.match(dailySource, /function isMissingV2TableError\(error\)/);
  assert.match(dailySource, /await saveLegacyArticles\(scoredArticles\)/);
  assert.match(dailySource, /Supabase v1 fallback save failed/);
  assert.match(dailySource, /throw error;/);
});

test("daily curator model is controlled by environment instead of a hard-coded future model", () => {
  assert.match(dailySource, /process\.env\.ANTHROPIC_MODEL/);
  assert.match(dailySource, /process\.env\.ANTHROPIC_ENABLE_THINKING/);
  assert.doesNotMatch(dailySource, /model:\s*"claude-opus-4-20250805"/);
});

test("migration keeps internal curation and learning data service-role-only", () => {
  assert.doesNotMatch(migrationSql, /FOR SELECT\s+USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migrationSql, /FOR INSERT\s+WITH CHECK\s*\(\s*true\s*\)/i);
  assert.match(
    migrationSql,
    /REVOKE ALL ON daily_ai_curations_v2 FROM PUBLIC, anon, authenticated;/
  );
  assert.match(
    migrationSql,
    /GRANT SELECT, INSERT, UPDATE ON daily_ai_curations_v2 TO service_role;/
  );
  assert.match(
    migrationSql,
    /REVOKE ALL ON monthly_learning_reports FROM PUBLIC, anon, authenticated;/
  );
  assert.match(
    migrationSql,
    /REVOKE ALL ON monthly_learning_summary FROM PUBLIC, anon, authenticated;/
  );
});

test("deployed GitHub Actions workflow has preflight checks and stable model defaults", () => {
  assert.match(workflowYaml, /Preflight secrets/);
  assert.match(workflowYaml, /Missing GitHub Secret: ANTHROPIC_API_KEY/);
  assert.match(workflowYaml, /ANTHROPIC_MODEL: "claude-3-5-sonnet-20241022"/);
  assert.match(workflowYaml, /ANTHROPIC_ENABLE_THINKING: "0"/);
});
