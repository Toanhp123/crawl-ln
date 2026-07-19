export function normalizeChapterUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.search = '';
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

export function chapterUrlDedupKey(value: string): string {
  const normalized = normalizeChapterUrl(value);
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = decodeURIComponent(parsed.pathname)
      .replace(/\/+$/, '')
      .replace(/\.html$/i, '');
    const numericId = pathname.match(/\/(\d+)$/)?.[1];
    if (/\/chapter\//i.test(pathname) && numericId) return `${host}/chapter/${numericId}`;
    return `${host}${pathname}`;
  } catch {
    return normalized
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .replace(/\.html$/i, '');
  }
}
