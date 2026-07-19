import type { AnalyzeNovelResult } from '../models/crawler-contracts.js';
import { CrawlerBadRequestError, CrawlerForbiddenError } from '../errors/crawler.error.js';
import type { RobotsPolicyPort } from '../ports/robots-policy.port.js';
import type { SourceAdapter } from '../ports/source-adapter.port.js';

const PREVIEW_CHAPTERS = 3;

function comparableHostname(url: string) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

function isSameHostname(sourceUrl: string, targetUrl: string) {
  try {
    return comparableHostname(sourceUrl) === comparableHostname(targetUrl);
  } catch {
    return false;
  }
}

function validateAnalyzeResult(result: AnalyzeNovelResult) {
  const title = result.title.trim();
  if (!title || title.length < 2) {
    throw new CrawlerBadRequestError('Analyze failed: title selector did not return a valid title');
  }

  if (result.chapters.length === 0) {
    throw new CrawlerBadRequestError(
      'Analyze failed: chapter selector returned 0 chapters. Check source profile selectors before crawling.'
    );
  }

  const offHost = result.chapters.find((chapter) => !isSameHostname(result.sourceUrl, chapter.url));
  if (offHost) {
    throw new CrawlerBadRequestError('Analyze failed: chapter URL is outside the source host', {
      sourceUrl: result.sourceUrl,
      chapterUrl: offHost.url
    });
  }
}

function addDiagnostics(result: AnalyzeNovelResult): AnalyzeNovelResult {
  return {
    ...result,
    diagnostics: {
      chapterCount: result.chapters.length,
      firstChapterUrls: result.chapters.slice(0, PREVIEW_CHAPTERS).map((chapter) => chapter.url)
    }
  };
}

export class AnalyzeSourceUseCase {
  constructor(
    private readonly adapters: SourceAdapter[],
    private readonly robotsPolicy: RobotsPolicyPort
  ) {}

  async execute(url: string): Promise<AnalyzeNovelResult> {
    const policy = await this.robotsPolicy.check(url);
    if (!policy.allowed)
      throw new CrawlerForbiddenError(policy.reason ?? 'Crawl blocked by policy');

    const adapter = await this.findAdapter(url);
    if (!adapter) throw new CrawlerBadRequestError('No safe adapter found for this source');

    const result = await adapter.analyzeNovel(url);
    validateAnalyzeResult(result);
    return addDiagnostics(result);
  }

  private async findAdapter(url: string) {
    for (const adapter of this.adapters) {
      if (await adapter.canHandle(url)) return adapter;
    }
    return null;
  }
}
