import type { ChapterContentResult } from '../models/crawler-contracts.js';
import { CrawlerBadRequestError, CrawlerForbiddenError } from '../errors/crawler.error.js';
import type { RateLimiterPort } from '../ports/rate-limiter.port.js';
import type { RobotsPolicyPort } from '../ports/robots-policy.port.js';
import type { SourceAdapter } from '../ports/source-adapter.port.js';

export class FetchChapterUseCase {
  constructor(
    private readonly adapters: SourceAdapter[],
    private readonly robotsPolicy: RobotsPolicyPort,
    private readonly rateLimiter: RateLimiterPort
  ) {}

  async execute(url: string, signal?: AbortSignal): Promise<ChapterContentResult> {
    const policy = await this.robotsPolicy.check(url);
    if (!policy.allowed)
      throw new CrawlerForbiddenError(policy.reason ?? 'Crawl blocked by policy');

    const adapter = await this.findAdapter(url);
    if (!adapter) throw new CrawlerBadRequestError('No safe adapter found for this source');

    await this.rateLimiter.wait(new URL(url).hostname.toLowerCase(), policy.crawlDelayMs);
    return adapter.fetchChapter(url, signal);
  }

  private async findAdapter(url: string) {
    for (const adapter of this.adapters) {
      if (await adapter.canHandle(url)) return adapter;
    }
    return null;
  }
}
