const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-1-20250805";

function getAnthropicModel(env = process.env) {
  return env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
}

function shouldEnableThinking(env = process.env) {
  return env.ANTHROPIC_ENABLE_THINKING !== "0";
}

function buildAnthropicMessageParams({
  maxTokens,
  messages,
  thinkingBudgetTokens,
  env = process.env,
}) {
  const params = {
    model: getAnthropicModel(env),
    max_tokens: maxTokens,
    messages,
  };

  if (thinkingBudgetTokens && shouldEnableThinking(env)) {
    params.thinking = {
      type: "enabled",
      budget_tokens: thinkingBudgetTokens,
    };
  }

  return params;
}

export {
  DEFAULT_ANTHROPIC_MODEL,
  buildAnthropicMessageParams,
  getAnthropicModel,
  shouldEnableThinking,
};
