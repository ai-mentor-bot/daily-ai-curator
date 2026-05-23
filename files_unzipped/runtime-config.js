function normalizeSupabaseUrl(url) {
  const trimmedUrl = url?.trim();

  if (!trimmedUrl || /^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }

  return `https://${trimmedUrl}`;
}

export { normalizeSupabaseUrl };
