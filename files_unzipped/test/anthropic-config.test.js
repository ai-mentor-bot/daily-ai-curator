import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ANTHROPIC_MODEL,
  getAnthropicModel,
} from "../anthropic-config.js";

test("defaults to a valid Opus 4.1 model id", () => {
  assert.equal(DEFAULT_ANTHROPIC_MODEL, "claude-opus-4-1-20250805");
  assert.equal(getAnthropicModel({}), DEFAULT_ANTHROPIC_MODEL);
});

test("allows Anthropic model override from environment", () => {
  assert.equal(
    getAnthropicModel({ ANTHROPIC_MODEL: " claude-sonnet-4-6 " }),
    "claude-sonnet-4-6",
  );
});
