import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_NON_THINKING_MAX_TOKENS,
  buildAnthropicRequest,
  getAnthropicModel,
  isThinkingEnabled,
} from "./anthropic-config.js";

const messages = [{ role: "user", content: "hello" }];

test("uses a stable default Anthropic model", () => {
  assert.equal(getAnthropicModel({}), DEFAULT_ANTHROPIC_MODEL);
});

test("allows the Anthropic model to be overridden", () => {
  assert.equal(
    getAnthropicModel({ ANTHROPIC_MODEL: "claude-opus-4-1-20250805" }),
    "claude-opus-4-1-20250805"
  );
});

test("omits thinking by default", () => {
  assert.deepEqual(
    buildAnthropicRequest({
      env: {},
      maxTokens: 2000,
      thinkingBudgetTokens: 1500,
      messages,
    }),
    {
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 2000,
      messages,
    }
  );
});

test("caps non-thinking requests to the stable model output limit", () => {
  assert.equal(
    buildAnthropicRequest({
      env: {},
      maxTokens: 16000,
      thinkingBudgetTokens: 8000,
      messages,
    }).max_tokens,
    DEFAULT_NON_THINKING_MAX_TOKENS
  );
});

test("adds thinking only when explicitly enabled", () => {
  assert.equal(isThinkingEnabled({ ANTHROPIC_ENABLE_THINKING: "1" }), true);
  assert.deepEqual(
    buildAnthropicRequest({
      env: { ANTHROPIC_ENABLE_THINKING: "true" },
      maxTokens: 2000,
      thinkingBudgetTokens: 1500,
      messages,
    }),
    {
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 2000,
      messages,
      thinking: {
        type: "enabled",
        budget_tokens: 1500,
      },
    }
  );
});
