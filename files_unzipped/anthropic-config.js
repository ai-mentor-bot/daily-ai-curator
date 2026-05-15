const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";
const DEFAULT_NON_THINKING_MAX_TOKENS = 4096;

function normalizeBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function getAnthropicModel(env = process.env) {
  return env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
}

function isThinkingEnabled(env = process.env) {
  return normalizeBoolean(env.ANTHROPIC_ENABLE_THINKING);
}

function buildAnthropicRequest({
  env = process.env,
  maxTokens,
  thinkingBudgetTokens,
  messages,
}) {
  const thinkingEnabled = Boolean(thinkingBudgetTokens && isThinkingEnabled(env));
  const request = {
    model: getAnthropicModel(env),
    max_tokens: thinkingEnabled
      ? maxTokens
      : Math.min(maxTokens, DEFAULT_NON_THINKING_MAX_TOKENS),
    messages,
  };

  if (thinkingEnabled) {
    request.thinking = {
      type: "enabled",
      budget_tokens: thinkingBudgetTokens,
    };
  }

  return request;
}

export {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_NON_THINKING_MAX_TOKENS,
  buildAnthropicRequest,
  getAnthropicModel,
  isThinkingEnabled,
};
