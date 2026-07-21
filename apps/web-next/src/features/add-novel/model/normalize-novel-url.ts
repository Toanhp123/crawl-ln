export function normalizeNovelUrl(value: string): string {
  const clean = value.trim();
  if (!clean) throw new Error('Novel URL is required');

  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new Error('Novel URL must be a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Novel URL must use http or https');
  }
  return parsed.toString();
}
