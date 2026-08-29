const FALSE_VALUES = new Set(["0", "false", "off", "no"]);

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-1-20250805";

export function getAnthropicModel(env = process.env) {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

export function isAnthropicThinkingEnabled(env = process.env) {
  const value = env.ANTHROPIC_ENABLE_THINKING;
  if (value === undefined) return true;
  return !FALSE_VALUES.has(value.trim().toLowerCase());
}

export function createAnthropicMessageParams({
  maxTokens,
  thinkingBudget,
  messages,
  env = process.env,
}) {
  const params = {
    model: getAnthropicModel(env),
    max_tokens: maxTokens,
    messages,
  };

  if (thinkingBudget && isAnthropicThinkingEnabled(env)) {
    if (thinkingBudget >= maxTokens) {
      throw new Error("thinkingBudget must be smaller than maxTokens");
    }
    params.thinking = {
      type: "enabled",
      budget_tokens: thinkingBudget,
    };
  }

  return params;
}
