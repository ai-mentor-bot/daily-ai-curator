import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const VALID_MODEL = "claude-opus-4-1-20250805";
const INVALID_MODEL = "claude-opus-4-20250805";

async function read(relativePath) {
  return readFile(path.resolve(directory, relativePath), "utf8");
}

test("all curator entry points use the valid configurable Opus model", async () => {
  const scripts = await Promise.all([
    read("daily-ai-curator.js"),
    read("daily-ai-curator-v2-hackathon.js"),
    read("monthly-learning-loop.js"),
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

test("the active workflow explicitly selects the valid model", async () => {
  const workflow = await read("../.github/workflows/daily-curator.yml");

  assert.match(
    workflow,
    new RegExp(`ANTHROPIC_MODEL: "${VALID_MODEL}"`)
  );
  assert.doesNotMatch(workflow, new RegExp(INVALID_MODEL));
});
