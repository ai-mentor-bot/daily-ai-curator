import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ANTHROPIC_MODEL,
  buildAnthropicRequest,
  getAnthropicModel,
  isThinkingEnabled,
} from "./anthropic-config.js";

test("defaults to the stable Anthropic model with thinking disabled", () => {
  const env = {};

  assert.equal(getAnthropicModel(env), DEFAULT_ANTHROPIC_MODEL);
  assert.equal(isThinkingEnabled(env), false);
  assert.deepEqual(
    buildAnthropicRequest({
      maxTokens: 2000,
      thinkingBudget: 1500,
      messages: [{ role: "user", content: "hello" }],
    }, env),
    {
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: "hello" }],
    }
  );
});

test("enables thinking only when explicitly requested", () => {
  const env = {
    ANTHROPIC_MODEL: "claude-opus-4-20250514",
    ANTHROPIC_ENABLE_THINKING: "true",
  };

  assert.equal(isThinkingEnabled(env), true);
  assert.deepEqual(
    buildAnthropicRequest({
      maxTokens: 3000,
      thinkingBudget: 2000,
      messages: [{ role: "user", content: "analyze" }],
    }, env),
    {
      model: "claude-opus-4-20250514",
      max_tokens: 3000,
      messages: [{ role: "user", content: "analyze" }],
      thinking: {
        type: "enabled",
        budget_tokens: 2000,
      },
    }
  );
});
