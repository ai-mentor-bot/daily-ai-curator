import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_ANTHROPIC_MODEL,
  createAnthropicMessageParams,
  getAnthropicModel,
  isAnthropicThinkingEnabled,
} from "../anthropic-config.js";

const messages = [{ role: "user", content: "hello" }];

describe("anthropic config", () => {
  it("uses a valid Opus 4.1 model by default", () => {
    assert.equal(getAnthropicModel({}), DEFAULT_ANTHROPIC_MODEL);
    assert.equal(DEFAULT_ANTHROPIC_MODEL, "claude-opus-4-1-20250805");
  });

  it("honors model and thinking environment overrides", () => {
    const params = createAnthropicMessageParams({
      maxTokens: 2000,
      thinkingBudget: 1500,
      messages,
      env: {
        ANTHROPIC_MODEL: "claude-3-5-sonnet-20241022",
        ANTHROPIC_ENABLE_THINKING: "0",
      },
    });

    assert.equal(params.model, "claude-3-5-sonnet-20241022");
    assert.equal(params.max_tokens, 2000);
    assert.deepEqual(params.messages, messages);
    assert.equal(params.thinking, undefined);
  });

  it("includes extended thinking only when enabled", () => {
    assert.equal(isAnthropicThinkingEnabled({ ANTHROPIC_ENABLE_THINKING: "false" }), false);

    const params = createAnthropicMessageParams({
      maxTokens: 2000,
      thinkingBudget: 1500,
      messages,
      env: {},
    });

    assert.deepEqual(params.thinking, {
      type: "enabled",
      budget_tokens: 1500,
    });
  });
});
