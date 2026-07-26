import { NOVELCOOL_HOST } from './novelcool.config.js';

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
