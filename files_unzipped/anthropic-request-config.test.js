import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_ANTHROPIC_MODEL,
  buildAnthropicMessageParams,
  getAnthropicModel,
  shouldEnableThinking,
} from "./anthropic-request-config.js";

test("uses the corrected Opus 4.1 model by default", () => {
  assert.equal(DEFAULT_ANTHROPIC_MODEL, "claude-opus-4-1-20250805");
  assert.equal(getAnthropicModel({}), DEFAULT_ANTHROPIC_MODEL);
});

test("allows an Anthropic model override", () => {
  assert.equal(
    getAnthropicModel({ ANTHROPIC_MODEL: "claude-sonnet-4-6" }),
    "claude-sonnet-4-6"
  );
});

test("includes thinking request config unless explicitly disabled", () => {
  assert.equal(shouldEnableThinking({}), true);

  const params = buildAnthropicMessageParams({
    maxTokens: 3000,
    thinkingBudgetTokens: 2000,
    messages: [{ role: "user", content: "Analyze this" }],
    env: {},
  });

  assert.deepEqual(params, {
    model: DEFAULT_ANTHROPIC_MODEL,
    max_tokens: 3000,
    messages: [{ role: "user", content: "Analyze this" }],
    thinking: {
      type: "enabled",
      budget_tokens: 2000,
    },
  });
});

test("omits thinking when ANTHROPIC_ENABLE_THINKING is zero", () => {
  assert.equal(shouldEnableThinking({ ANTHROPIC_ENABLE_THINKING: "0" }), false);

  const params = buildAnthropicMessageParams({
    maxTokens: 2000,
    thinkingBudgetTokens: 1500,
    messages: [{ role: "user", content: "Find articles" }],
    env: {
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
      ANTHROPIC_ENABLE_THINKING: "0",
    },
  });

  assert.deepEqual(params, {
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: "Find articles" }],
  });
});
