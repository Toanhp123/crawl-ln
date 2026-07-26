const trackingQueryKeys = new Set(['utm', 'fbclid', 'gclid']);

function normalizedQuery(url: URL): string {
  const entries = [...url.searchParams.entries()].filter(
    ([key]) => !trackingQueryKeys.has(key.toLowerCase()) && !key.toLowerCase().startsWith('utm_')
  );
  entries.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    `${leftKey}\u0000${leftValue}`.localeCompare(`${rightKey}\u0000${rightValue}`)
  );
  const query = new URLSearchParams(entries).toString();
  return query ? `?${query}` : '';
}

/** NovelCool aliases chapter pages by the numeric id at the end of the path. */
export function novelCoolChapterUrlKey(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = decodeURIComponent(url.pathname)
      .replace(/\/+$/, '')
      .replace(/\.html$/i, '');
    const numericId = pathname.match(/\/(\d+)$/)?.[1];
    if (/\/chapter\//i.test(pathname) && numericId) return `${host}/chapter/${numericId}`;
    return `${host}${pathname || '/'}${normalizedQuery(url)}`;
  } catch {
    return value.split('#', 1)[0] ?? value;
  }
}
