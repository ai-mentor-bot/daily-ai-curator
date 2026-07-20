import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const MODEL = "claude-opus-4-8";

async function read(relativePath) {
  return readFile(path.resolve(directory, relativePath), "utf8");
}

test("all curator entry points use the current configurable Anthropic model", async () => {
  const scripts = await Promise.all([
    read("daily-ai-curator.js"),
    read("daily-ai-curator-v2-hackathon.js"),
    read("monthly-learning-loop.js"),
  ]);

  for (const script of scripts) {
    assert.match(
      script,
      new RegExp(`process\\.env\\.ANTHROPIC_MODEL \\|\\| "${MODEL}"`)
    );
    assert.match(script, /model: ANTHROPIC_MODEL/);
    assert.doesNotMatch(script, /claude-opus-4-20250805/);
    assert.doesNotMatch(
      script,
      /thinking:\s*\{\s*type:\s*"enabled"/s,
      "Opus 4.8 rejects manual thinking budgets"
    );
  }
});

test("the active workflow explicitly selects the current model", async () => {
  const workflow = await read("../.github/workflows/daily-curator.yml");

  assert.match(workflow, new RegExp(`ANTHROPIC_MODEL: "${MODEL}"`));
  assert.doesNotMatch(workflow, /claude-opus-4-20250805/);
});
