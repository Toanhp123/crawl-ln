function cleanText(text: string | undefined) {
  return (text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const promotionalFooterMarkers = [
  /(?:\n?\*{8,}\s*)?\n?If you want to read more chapters[,\s]+you can find them on Patreon:[\s\S]*$/i,
  /(?:\n?\*{8,}\s*)?\n?You can find more chapters on Patreon[\s\S]*$/i,
  /(?:\n?\*{8,}\s*)?\n?Support (me|us|the author) on Patreon[\s\S]*$/i,
  /(?:\n?\*{8,}\s*)?\n?Please support (me|us|the author)[\s\S]*$/i,
  /(?:\n?\*{8,}\s*)?\n?Read more chapters at[\s\S]*$/i,
  /(?:\n?\*{8,}\s*)?\n?Join (my|our) Patreon[\s\S]*$/i,
  /(?:\n?\*{8,}\s*)?\n?Tier\s+\d+[\s\S]*$/i,
  /(?:\n?\*{8,}\s*)?\n?Free\s+\d+-day trial[\s\S]*$/i
];

export function sanitizeChapterText(text: string, title?: string): string {
  let value = text;

  for (const marker of promotionalFooterMarkers) {
    value = value.replace(marker, '');
  }

  const lines = cleanText(value)
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean);

  const normalizedTitle = cleanText(title).toLowerCase();
  const filtered: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/^\*{8,}$/.test(line)) continue;
    if (/^download$/i.test(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;
    if (/^novelcool\.com\//i.test(line)) continue;
    if (/^\/\s*chapter\b/i.test(line)) continue;
    if (/^chapter\s+\d+\s*$/.test(lower)) continue;
    if (normalizedTitle && lower === normalizedTitle) continue;
    if (normalizedTitle && lower === `1. ${normalizedTitle}`) continue;
    filtered.push(line);
  }

  return cleanText(filtered.join('\n\n'));
}
