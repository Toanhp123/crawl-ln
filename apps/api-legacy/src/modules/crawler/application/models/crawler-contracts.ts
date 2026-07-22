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
export type NovelStatus = 'analyzed' | 'crawling' | 'completed' | 'failed';
export type Novel = {
  id: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  status: NovelStatus;
  createdAt: string;
  updatedAt: string;
  autoUpdateEnabled?: boolean;
  updateIntervalMinutes?: 0 | 360 | 720 | 1440 | 10080;
  lastUpdateCheckAt?: string;
  nextUpdateCheckAt?: string;
  lastUpdateResult?: 'idle' | 'up_to_date' | 'queued' | 'skipped_active_task' | 'failed';
  consecutiveUpdateFailures?: number;
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
export type ChapterContentResult = {
  title: string;
  url: string;
  rawText: string;
  cleanText: string;
};
export type NovelDetail = { novel: Novel; chapters: Chapter[] };
