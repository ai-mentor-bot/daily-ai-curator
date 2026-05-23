import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSupabaseUrl } from "./runtime-config.js";

test("normalizeSupabaseUrl keeps fully qualified URLs", () => {
  assert.equal(
    normalizeSupabaseUrl("https://example.supabase.co"),
    "https://example.supabase.co"
  );
  assert.equal(
    normalizeSupabaseUrl("http://localhost:54321"),
    "http://localhost:54321"
  );
});

test("normalizeSupabaseUrl accepts bare Supabase hosts", () => {
  assert.equal(
    normalizeSupabaseUrl("project-ref.supabase.co"),
    "https://project-ref.supabase.co"
  );
});

test("normalizeSupabaseUrl trims whitespace before validation", () => {
  assert.equal(
    normalizeSupabaseUrl("  project-ref.supabase.co  "),
    "https://project-ref.supabase.co"
  );
  assert.equal(
    normalizeSupabaseUrl("  https://project-ref.supabase.co  "),
    "https://project-ref.supabase.co"
  );
});

test("normalizeSupabaseUrl preserves missing values for existing validation", () => {
  assert.equal(normalizeSupabaseUrl(undefined), undefined);
  assert.equal(normalizeSupabaseUrl("   "), "");
});
