const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-1-20250805";

const FALSE_VALUES = new Set(["0", "false", "off", "no", "disabled"]);
const TRUE_VALUES = new Set(["1", "true", "on", "yes", "enabled"]);

function getAnthropicModel(env = process.env) {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

function supportsExtendedThinking(model) {
  return (
    /^claude-(opus|sonnet)-4(-|$)/.test(model) ||
    /^claude-3-7-sonnet-/.test(model)
  );
}

function parseThinkingFlag(value) {
  if (value === undefined || value === null || value === "") return null;

  const normalized = String(value).trim().toLowerCase();
  if (FALSE_VALUES.has(normalized)) return false;
  if (TRUE_VALUES.has(normalized)) return true;

  return null;
}

function shouldEnableThinking(model, env = process.env) {
  const explicitFlag = parseThinkingFlag(env.ANTHROPIC_ENABLE_THINKING);

  if (explicitFlag !== null) {
    return explicitFlag && supportsExtendedThinking(model);
  }

  return supportsExtendedThinking(model);
}

function buildAnthropicMessageParams(params, env = process.env) {
  const {
    thinking_budget_tokens: thinkingBudgetTokens,
    ...messageParams
  } = params;
  const model = getAnthropicModel(env);
  const requestParams = {
    ...messageParams,
    model,
  };

  if (thinkingBudgetTokens && shouldEnableThinking(model, env)) {
    requestParams.thinking = {
      type: "enabled",
      budget_tokens: thinkingBudgetTokens,
    };
  }

  return requestParams;
}

export {
  DEFAULT_ANTHROPIC_MODEL,
  buildAnthropicMessageParams,
  getAnthropicModel,
  shouldEnableThinking,
  supportsExtendedThinking,
};
