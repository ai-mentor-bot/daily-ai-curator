import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ANTHROPIC_MODEL,
  buildAnthropicRequest,
  getAnthropicModel,
  isAnthropicThinkingEnabled,
  normalizeSupabaseUrl,
} from "./runtime-config.js";

test("normalizes bare Supabase host to HTTPS URL", () => {
  assert.equal(
    normalizeSupabaseUrl("example-ref.supabase.co"),
    "https://example-ref.supabase.co"
  );
});

test("preserves explicit Supabase URL scheme", () => {
  assert.equal(
    normalizeSupabaseUrl("https://example-ref.supabase.co"),
    "https://example-ref.supabase.co"
  );
  assert.equal(
    normalizeSupabaseUrl("http://localhost:54321"),
    "http://localhost:54321"
  );
});

test("uses stable Anthropic default unless overridden", () => {
  assert.equal(getAnthropicModel({}), DEFAULT_ANTHROPIC_MODEL);
  assert.equal(
    getAnthropicModel({ ANTHROPIC_MODEL: " claude-custom-model " }),
    "claude-custom-model"
  );
});

test("keeps thinking disabled unless explicitly enabled", () => {
  assert.equal(isAnthropicThinkingEnabled({}), false);
  assert.equal(isAnthropicThinkingEnabled({ ANTHROPIC_ENABLE_THINKING: "0" }), false);
  assert.equal(isAnthropicThinkingEnabled({ ANTHROPIC_ENABLE_THINKING: "true" }), true);
});

test("builds Anthropic request without thinking by default", () => {
  const request = buildAnthropicRequest({
    maxTokens: 2000,
    thinkingBudget: 1500,
    messages: [{ role: "user", content: "hello" }],
    env: {},
  });

  assert.deepEqual(request, {
    model: DEFAULT_ANTHROPIC_MODEL,
    max_tokens: 2000,
    messages: [{ role: "user", content: "hello" }],
  });
});

test("adds thinking block only when enabled", () => {
  const request = buildAnthropicRequest({
    maxTokens: 2000,
    thinkingBudget: 1500,
    messages: [{ role: "user", content: "hello" }],
    env: { ANTHROPIC_ENABLE_THINKING: "1" },
  });

  assert.deepEqual(request.thinking, {
    type: "enabled",
    budget_tokens: 1500,
  });
});
