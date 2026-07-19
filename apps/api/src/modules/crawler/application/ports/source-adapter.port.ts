import type { AnalyzeNovelResult, ChapterContentResult } from '../models/crawler-contracts.js';

export interface SourceAdapter {
  sourceName: string;
  canHandle(url: string): boolean | Promise<boolean>;
  analyzeNovel(url: string): Promise<AnalyzeNovelResult>;
  fetchChapter(url: string, signal?: AbortSignal): Promise<ChapterContentResult>;
}
