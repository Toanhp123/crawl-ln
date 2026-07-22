import { CrawlerBadRequestError, CrawlerForbiddenError } from '../errors/crawler.error.js';
import type { AnalyzeNovelResult } from '../models/crawler-contracts.js';
import type { RobotsPolicyPort } from '../ports/robots-policy.port.js';
import type { CrawlerSourceReaderPort } from '../ports/source-reader.port.js';

const PREVIEW_CHAPTERS = 3;
const CHAPTER_BATCH_SIZE = 200;

function comparableHostname(url: string) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

export class AnalyzeSourceUseCase {
  constructor(
    private readonly sourceReader: CrawlerSourceReaderPort,
    private readonly robotsPolicy: RobotsPolicyPort
  ) {}

  async execute(url: string, signal?: AbortSignal): Promise<AnalyzeNovelResult> {
    const policy = await this.robotsPolicy.check(url);
    if (!policy.allowed) {
      throw new CrawlerForbiddenError(policy.reason ?? 'Crawl blocked by policy');
    }

    const metadata = await this.sourceReader.readMetadata({ url, signal });
    const chapters: AnalyzeNovelResult['chapters'] = [];
    for await (const batch of this.sourceReader.streamChapterList({
      url,
      batchSize: CHAPTER_BATCH_SIZE,
      signal
    })) {
      chapters.push(...batch.data);
    }

    if (chapters.length === 0) {
      throw new CrawlerBadRequestError('Analyze failed: source returned 0 chapters');
    }
    const sourceHost = comparableHostname(metadata.data.sourceUrl);
    const offHost = chapters.find((chapter) => comparableHostname(chapter.url) !== sourceHost);
    if (offHost) {
      throw new CrawlerBadRequestError('Analyze failed: chapter URL is outside the source host', {
        sourceUrl: metadata.data.sourceUrl,
        chapterUrl: offHost.url
      });
    }

    return {
      ...metadata.data,
      chapters,
      diagnostics: {
        chapterCount: chapters.length,
        firstChapterUrls: chapters.slice(0, PREVIEW_CHAPTERS).map((chapter) => chapter.url)
      }
    };
  }
}
