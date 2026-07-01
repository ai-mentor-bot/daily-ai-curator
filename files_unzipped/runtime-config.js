const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";

function envValue(env, key) {
  return (env[key] || "").trim();
}

function normalizeSupabaseUrl(rawUrl) {
  const trimmedUrl = (rawUrl || "").trim();
  if (!trimmedUrl) return trimmedUrl;
  if (/^https?:\/\//i.test(trimmedUrl)) return trimmedUrl;

  return `https://${trimmedUrl}`;
}

function getAnthropicModel(env = process.env) {
  return envValue(env, "ANTHROPIC_MODEL") || DEFAULT_ANTHROPIC_MODEL;
}

function isAnthropicThinkingEnabled(env = process.env) {
  const value = envValue(env, "ANTHROPIC_ENABLE_THINKING").toLowerCase();
  return value === "1" || value === "true";
}

function buildAnthropicRequest({ maxTokens, thinkingBudget, messages, env = process.env }) {
  const request = {
    model: getAnthropicModel(env),
    max_tokens: maxTokens,
    messages,
  };

  if (isAnthropicThinkingEnabled(env)) {
    request.thinking = {
      type: "enabled",
      budget_tokens: thinkingBudget,
    };
  }

  return request;
}

export {
  DEFAULT_ANTHROPIC_MODEL,
  buildAnthropicRequest,
  getAnthropicModel,
  isAnthropicThinkingEnabled,
  normalizeSupabaseUrl,
};
