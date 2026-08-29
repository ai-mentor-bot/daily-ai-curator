export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-1-20250805";

export function getAnthropicModel(env = process.env) {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}
