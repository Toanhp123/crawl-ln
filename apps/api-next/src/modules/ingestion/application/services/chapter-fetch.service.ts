import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionSourceReaderPort } from '../ports/source-reader.port.js';
import type { SourcePolicyService } from './source-policy.service.js';

function cleanText(text: string | undefined): string {
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

export function sanitizeIngestionChapterText(text: string, title?: string): string {
  let value = text;
  for (const marker of promotionalFooterMarkers) value = value.replace(marker, '');

  const normalizedTitle = cleanText(title).toLowerCase();
  const lines = cleanText(value)
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter((line) => {
      const lower = line.toLowerCase();
      if (/^\*{8,}$/.test(line)) return false;
      if (/^download$/i.test(line)) return false;
      if (/^https?:\/\//i.test(line)) return false;
      if (/^novelcool\.com\//i.test(line)) return false;
      if (/^\/\s*chapter\b/i.test(line)) return false;
      if (/^chapter\s+\d+\s*$/.test(lower)) return false;
      if (normalizedTitle && (lower === normalizedTitle || lower === `1. ${normalizedTitle}`)) {
        return false;
      }
      return true;
    });
  return cleanText(lines.join('\n\n'));
}

export function chooseIngestionChapterTitle(existingTitle: string, fetchedTitle: string): string {
  const existing = existingTitle.trim();
  const fetched = fetchedTitle.trim();
  const generic = /^(chapter|chap|chuong)(?:\s+\d+)?$/i;
  if (!fetched || generic.test(fetched)) return existing || fetched;
  if (!existing || generic.test(existing)) return fetched;
  return fetched.length > existing.length ? fetched : existing;
}

export class ChapterFetchService {
  constructor(
    private readonly sourceReader: IngestionSourceReaderPort,
    private readonly sourcePolicy: SourcePolicyService
  ) {}

  async execute(
    chapter: { title: string; sourceUrl: string },
    signal?: AbortSignal
  ): Promise<{ title: string; rawText: string; cleanText: string }> {
    await this.sourcePolicy.assertAllowed(chapter.sourceUrl);
    const result = await this.sourceReader.readChapterContent({ url: chapter.sourceUrl, signal });
    this.sourcePolicy.assertChapterHosts(chapter.sourceUrl, [
      { index: 0, title: result.data.title, url: result.data.url }
    ]);
    const title = chooseIngestionChapterTitle(chapter.title, result.data.title);
    const clean = sanitizeIngestionChapterText(result.data.cleanText || result.data.rawText, title);
    if (!clean) throw IngestionError.validation('Fetched chapter content is empty after cleaning');
    return { title, rawText: result.data.rawText, cleanText: clean };
  }
}
