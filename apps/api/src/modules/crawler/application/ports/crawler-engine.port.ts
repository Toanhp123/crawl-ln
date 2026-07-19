import type { AnalyzeNovelResult, ChapterContentResult } from '../models/crawler-contracts.js';

export interface CrawlerEnginePort {
  analyze(url: string): Promise<AnalyzeNovelResult>;
  fetchChapter(url: string, signal?: AbortSignal): Promise<ChapterContentResult>;
}
