import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const VALID_MODEL = "claude-opus-4-8";
const INVALID_MODEL = "claude-opus-4-20250805";

async function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("all curator entry points use the supported configurable model", async () => {
  const scripts = await Promise.all([
    read("./daily-ai-curator.js"),
    read("./daily-ai-curator-v2-hackathon.js"),
    read("./monthly-learning-loop.js"),
  ]);

  for (const script of scripts) {
    assert.doesNotMatch(script, new RegExp(INVALID_MODEL));
    assert.match(
      script,
      new RegExp(
        `process\\.env\\.ANTHROPIC_MODEL \\|\\| "${VALID_MODEL}"`
      )
    );
    assert.match(script, /model: ANTHROPIC_MODEL/);
  }
});

test("the active workflow explicitly selects the supported model", async () => {
  const workflow = await read("../.github/workflows/daily-curator.yml");

  assert.match(
    workflow,
    new RegExp(`ANTHROPIC_MODEL: "${VALID_MODEL}"`)
  );
  assert.doesNotMatch(workflow, new RegExp(INVALID_MODEL));
});
