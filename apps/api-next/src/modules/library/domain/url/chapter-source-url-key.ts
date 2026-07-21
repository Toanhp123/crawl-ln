export function chapterSourceUrlKey(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = decodeURIComponent(url.pathname)
      .replace(/\/+$/, '')
      .replace(/\.html$/i, '');
    const numericId = pathname.match(/\/(\d+)$/)?.[1];
    if (/\/chapter\//i.test(pathname) && numericId) return `${host}/chapter/${numericId}`;
    return `${host}${pathname}`;
  } catch {
    return value
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .replace(/\.html$/i, '');
  }
}
