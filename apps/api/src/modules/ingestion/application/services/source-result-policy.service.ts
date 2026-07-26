import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionSourceChapter } from '../ports/source-reader.port.js';

function comparableHostname(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    throw IngestionError.validation('Source URL is invalid', { url: value });
  }
}

/** Validates relationships between source results and the requested source. */
export class SourceResultPolicyService {
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
