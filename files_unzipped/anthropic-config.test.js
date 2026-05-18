import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ANTHROPIC_MODEL,
  buildAnthropicMessageParams,
  getAnthropicModel,
  isThinkingEnabled,
} from "./anthropic-config.js";

test("uses the stable default model when no override is provided", () => {
  assert.equal(getAnthropicModel({}), DEFAULT_ANTHROPIC_MODEL);
});

test("uses ANTHROPIC_MODEL when provided", () => {
  assert.equal(
    getAnthropicModel({ ANTHROPIC_MODEL: "claude-custom-model" }),
    "claude-custom-model"
  );
});

test("does not send thinking parameters by default", () => {
  const params = buildAnthropicMessageParams({
    maxTokens: 2000,
    thinkingBudget: 1500,
    messages: [{ role: "user", content: "hello" }],
    env: {},
  });

  assert.equal(params.model, DEFAULT_ANTHROPIC_MODEL);
  assert.equal(params.max_tokens, 2000);
  assert.ok(!("thinking" in params));
});

test("sends thinking parameters only when explicitly enabled", () => {
  const params = buildAnthropicMessageParams({
    maxTokens: 2000,
    thinkingBudget: 1500,
    messages: [{ role: "user", content: "hello" }],
    env: { ANTHROPIC_ENABLE_THINKING: "true" },
  });

  assert.equal(isThinkingEnabled({ ANTHROPIC_ENABLE_THINKING: "true" }), true);
  assert.deepEqual(params.thinking, {
    type: "enabled",
    budget_tokens: 1500,
  });
});
