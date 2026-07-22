import type { ChapterContentResult } from '../models/crawler-contracts.js';
import { CrawlerForbiddenError } from '../errors/crawler.error.js';
import type { RateLimiterPort } from '../ports/rate-limiter.port.js';
import type { RobotsPolicyPort } from '../ports/robots-policy.port.js';
import type { CrawlerSourceReaderPort } from '../ports/source-reader.port.js';

export class FetchChapterUseCase {
  constructor(
    private readonly sourceReader: CrawlerSourceReaderPort,
    private readonly robotsPolicy: RobotsPolicyPort,
    private readonly rateLimiter: RateLimiterPort
  ) {}

  async execute(url: string, signal?: AbortSignal): Promise<ChapterContentResult> {
    const policy = await this.robotsPolicy.check(url);
    if (!policy.allowed) {
      throw new CrawlerForbiddenError(policy.reason ?? 'Crawl blocked by policy');
    }

    await this.rateLimiter.wait(new URL(url).hostname.toLowerCase(), policy.crawlDelayMs);
    const result = await this.sourceReader.readChapterContent({ url, signal });
    return result.data;
  }
}
