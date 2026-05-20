import assert from "node:assert/strict";
import { normalizeSupabaseUrl } from "./runtime-config.js";

assert.equal(
  normalizeSupabaseUrl("abcdefghijklmnopqrst.supabase.co"),
  "https://abcdefghijklmnopqrst.supabase.co"
);
assert.equal(
  normalizeSupabaseUrl("  https://abcdefghijklmnopqrst.supabase.co  "),
  "https://abcdefghijklmnopqrst.supabase.co"
);
assert.equal(normalizeSupabaseUrl(""), "");
assert.equal(normalizeSupabaseUrl(undefined), "");
assert.equal(normalizeSupabaseUrl("project-ref-without-host"), "project-ref-without-host");

console.log("runtime-config tests passed");
