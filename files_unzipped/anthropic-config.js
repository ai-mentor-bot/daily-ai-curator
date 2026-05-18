const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";
const THINKING_ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

function getAnthropicModel(env = process.env) {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

function isThinkingEnabled(env = process.env) {
  return THINKING_ENABLED_VALUES.has(
    String(env.ANTHROPIC_ENABLE_THINKING || "").trim().toLowerCase()
  );
}

function buildAnthropicMessageParams({
  maxTokens,
  messages,
  thinkingBudget,
  env = process.env,
}) {
  const params = {
    model: getAnthropicModel(env),
    max_tokens: maxTokens,
    messages,
  };

  if (thinkingBudget && isThinkingEnabled(env)) {
    params.thinking = {
      type: "enabled",
      budget_tokens: thinkingBudget,
    };
  }

  return params;
}

export {
  DEFAULT_ANTHROPIC_MODEL,
  buildAnthropicMessageParams,
  getAnthropicModel,
  isThinkingEnabled,
};
