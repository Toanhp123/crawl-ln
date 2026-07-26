import { NOVELCOOL_HOST } from './novelcool.config.js';

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

export function normalizedNovelCoolHost(value: string): string {
  return value.toLowerCase().replace(/^www\./, '');
}

export function isNovelCoolHost(value: string): boolean {
  return normalizedNovelCoolHost(value) === NOVELCOOL_HOST;
}

export function novelCoolPageType(value: string): 'novel' | 'chapter' | 'unknown' {
  try {
    const url = new URL(value);
    if (!isNovelCoolHost(url.hostname)) return 'unknown';
    if (/\/chapter\//i.test(url.pathname)) return 'chapter';
    if (/\/novel\//i.test(url.pathname)) return 'novel';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function isNovelCoolContentPath(value: string): boolean {
  const pageType = novelCoolPageType(value);
  if (pageType === 'unknown') return false;
  try {
    const pathname = new URL(value).pathname;
    return !/^\/(?:account|login)(?:\/|$)/i.test(pathname);
  } catch {
    return false;
  }
}

export function novelCoolChapterId(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!isNovelCoolHost(url.hostname) || !/\/chapter\//i.test(url.pathname)) return undefined;
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '');
    return pathname.match(/\/(\d+)(?:\.html)?$/i)?.[1];
  } catch {
    return undefined;
  }
}

export function novelCoolChapterKey(value: string): string {
  const id = novelCoolChapterId(value);
  if (id) return `${NOVELCOOL_HOST}/chapter/${id}`;

  try {
    const url = new URL(value);
    url.hostname = normalizedNovelCoolHost(url.hostname);
    url.hash = '';
    const pathname = decodeURIComponent(url.pathname)
      .replace(/\/+$/, '')
      .replace(/\.html$/i, '');
    return `${url.hostname}${pathname || '/'}${normalizedQuery(url)}`;
  } catch {
    return value.split('#', 1)[0] ?? value;
  }
}
