import type { Novel } from '../../domain/models/novel.js';

export type ChapterStatus = 'pending' | 'fetched' | 'failed';
export type Chapter = {
  id: string;
  novelId: string;
  index: number;
  title: string;
  sourceUrl: string;
  rawText?: string;
  cleanText?: string;
  status: ChapterStatus;
  errorMessage?: string;
  contentVersion: number;
};
export type TaskStatus =
  'queued' | 'running' | 'pausing' | 'paused' | 'resuming' | 'completed' | 'failed' | 'cancelled';
export type TaskOutcome = 'success' | 'partial' | 'failure';
export type CrawlTask = {
  id: string;
  novelId: string;
  status: TaskStatus;
  outcome?: TaskOutcome;
  totalChapters: number;
  fetchedChapters: number;
  failedChapters: number;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  pausedAt?: string;
  totalPausedMs: number;
  currentSpeed: number;
  averageSpeed: number;
  etaSeconds?: number;
  createdAt: string;
  updatedAt: string;
};
export type NovelDetail = { novel: Novel; chapters: Chapter[] };
export type ChapterPreview = { index: number; title: string; url: string };
export type AnalyzeNovelResult = {
  title: string;
  sourceUrl: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  chapters: ChapterPreview[];
  diagnostics?: { chapterCount: number; firstChapterUrls: string[] };
};
export type { Novel };

export type UpdateNovelResult = {
  novel: NovelDetail;
  newChapterCount: number;
  pendingChapterCount: number;
  task: CrawlTask | null;
};
