function hasHttpScheme(value) {
  return /^https?:\/\//i.test(value);
}

function looksLikeHostname(value) {
  return (
    /^localhost(?::\d+)?(?:\/.*)?$/i.test(value) ||
    /^[^\s/:]+(?:\.[^\s/:]+)+(?::\d+)?(?:\/.*)?$/.test(value)
  );
}

export function normalizeSupabaseUrl(rawUrl) {
  const value = String(rawUrl ?? "").trim();

  if (!value || hasHttpScheme(value)) {
    return value;
  }

  if (looksLikeHostname(value)) {
    return `https://${value}`;
  }

  return value;
}
