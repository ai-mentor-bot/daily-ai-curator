import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_KEY = "test-key";

const daily = await import("./daily-ai-curator.js");
const monthly = await import("./monthly-learning-loop.js");

test("isDirectRun handles relative and absolute script paths", () => {
  const scriptPath = resolve("daily-ai-curator.js");
  const scriptUrl = pathToFileURL(scriptPath).href;

  assert.equal(daily.isDirectRun(scriptUrl, "daily-ai-curator.js"), true);
  assert.equal(daily.isDirectRun(scriptUrl, scriptPath), true);
  assert.equal(daily.isDirectRun(scriptUrl, "other.js"), false);
});

test("monthly isDirectRun handles relative script paths", () => {
  const scriptPath = resolve("monthly-learning-loop.js");
  const scriptUrl = pathToFileURL(scriptPath).href;

  assert.equal(monthly.isDirectRun(scriptUrl, "monthly-learning-loop.js"), true);
});

test("extractTextContent skips non-text response blocks", () => {
  assert.equal(
    daily.extractTextContent({
      content: [
        { type: "thinking", thinking: "internal" },
        { type: "text", text: "[{\"title\":\"ok\"}]" },
      ],
    }),
    "[{\"title\":\"ok\"}]"
  );

  assert.equal(daily.extractTextContent({ content: [] }), "");
});

test("parseJsonArrayFromText returns arrays and drops malformed content", () => {
  assert.deepEqual(
    daily.parseJsonArrayFromText('prefix [{"title":"ok"}] suffix', "test response"),
    [{ title: "ok" }]
  );
  assert.deepEqual(daily.parseJsonArrayFromText("no json here", "test response"), []);
  assert.deepEqual(daily.parseJsonArrayFromText("[invalid", "test response"), []);
});

test("formatLineMessageWithConfidence tolerates missing optional arrays", () => {
  const message = daily.formatLineMessageWithConfidence([
    {
      article_title: "Important article",
      article_url: "https://example.com/article",
      category: "CloserAI",
      confidence: undefined,
      implementation_complexity: "LOW",
      total_score: 90,
    },
  ]);

  assert.match(message, /Important article/);
  assert.match(message, /対象: 未指定/);
  assert.match(message, /リスク: なし/);
});
