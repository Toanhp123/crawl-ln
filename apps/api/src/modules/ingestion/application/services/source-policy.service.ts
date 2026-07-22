import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionSourceChapter } from '../ports/source-reader.port.js';

export interface SourceAccessPolicyPort {
  check(url: string): Promise<{ allowed: boolean; reason?: string; crawlDelayMs?: number }>;
}

function comparableHostname(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    throw IngestionError.validation('Source URL is invalid', { url: value });
  }
}

export class SourcePolicyService {
  constructor(private readonly accessPolicy: SourceAccessPolicyPort) {}

  async assertAllowed(url: string): Promise<void> {
    const decision = await this.accessPolicy.check(url);
    if (!decision.allowed) {
      throw new IngestionError(
        'INGESTION_SOURCE_POLICY_DENIED',
        decision.reason ?? 'Source access is denied by policy',
        { url }
      );
    }
  }

  assertChapterHosts(sourceUrl: string, chapters: readonly IngestionSourceChapter[]): void {
    const sourceHost = comparableHostname(sourceUrl);
    const outside = chapters.find((chapter) => comparableHostname(chapter.url) !== sourceHost);
    if (outside) {
      throw IngestionError.validation('Chapter URL is outside the metadata source host', {
        sourceUrl,
        chapterUrl: outside.url
      });
    }
  }
}
