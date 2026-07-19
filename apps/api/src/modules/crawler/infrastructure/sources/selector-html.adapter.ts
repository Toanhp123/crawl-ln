import type { AnalyzeNovelResult, ChapterContentResult } from '@novel-tool/shared';
import type { SourceAdapter } from '../../application/ports/source-adapter.port.js';
import type { CrawlerEnginePort } from '../../application/ports/crawler-engine.port.js';
import type { SourceDetectorPort } from '../../application/ports/source-detector.port.js';

export class SelectorHtmlAdapter implements SourceAdapter {
  sourceName = 'selector-html';

  constructor(
    private readonly detector: SourceDetectorPort,
    private readonly engine: CrawlerEnginePort
  ) {}

  async canHandle(url: string): Promise<boolean> {
    return (await this.detector.detect(url)) != null;
  }

  async analyzeNovel(url: string): Promise<AnalyzeNovelResult> {
    return this.engine.analyze(url);
  }

  async fetchChapter(url: string, signal?: AbortSignal): Promise<ChapterContentResult> {
    return this.engine.fetchChapter(url, signal);
  }
}
