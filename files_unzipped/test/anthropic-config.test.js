import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ANTHROPIC_MODEL,
  buildAnthropicMessageParams,
  shouldEnableThinking,
  supportsExtendedThinking,
} from "../anthropic-config.js";

test("uses the valid Opus 4.1 model by default", () => {
  const params = buildAnthropicMessageParams(
    {
      max_tokens: 2000,
      thinking_budget_tokens: 1500,
      messages: [{ role: "user", content: "hello" }],
    },
    {}
  );

  assert.equal(params.model, DEFAULT_ANTHROPIC_MODEL);
  assert.equal(params.model, "claude-opus-4-1-20250805");
  assert.deepEqual(params.thinking, {
    type: "enabled",
    budget_tokens: 1500,
  });
});

test("does not send thinking options when workflow disables thinking", () => {
  const params = buildAnthropicMessageParams(
    {
      max_tokens: 2000,
      thinking_budget_tokens: 1500,
      messages: [{ role: "user", content: "hello" }],
    },
    {
      ANTHROPIC_MODEL: "claude-3-5-sonnet-20241022",
      ANTHROPIC_ENABLE_THINKING: "0",
    }
  );

  assert.equal(params.model, "claude-3-5-sonnet-20241022");
  assert.equal(params.thinking, undefined);
});

test("does not force thinking onto models that do not support it", () => {
  assert.equal(supportsExtendedThinking("claude-3-5-sonnet-20241022"), false);
  assert.equal(
    shouldEnableThinking("claude-3-5-sonnet-20241022", {
      ANTHROPIC_ENABLE_THINKING: "1",
    }),
    false
  );
});
