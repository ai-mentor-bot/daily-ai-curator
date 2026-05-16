const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";

export function getAnthropicModel(env = process.env) {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

export function isThinkingEnabled(env = process.env) {
  return TRUE_VALUES.has(
    String(env.ANTHROPIC_ENABLE_THINKING || "").trim().toLowerCase()
  );
}

export function buildAnthropicRequest(
  { maxTokens, thinkingBudget, messages },
  env = process.env
) {
  const request = {
    model: getAnthropicModel(env),
    max_tokens: maxTokens,
    messages,
  };

  if (isThinkingEnabled(env) && thinkingBudget) {
    request.thinking = {
      type: "enabled",
      budget_tokens: thinkingBudget,
    };
  }

  return request;
}

export function getAnthropicModeDescription(env = process.env) {
  const thinkingMode = isThinkingEnabled(env) ? "thinking-enabled" : "standard";
  return `${thinkingMode} (${getAnthropicModel(env)})`;
}
