export type AutoUpdateInterval = 0 | 360 | 720 | 1440 | 10080;
export type NovelUpdateResultCode =
  'idle' | 'up_to_date' | 'queued' | 'skipped_active_task' | 'failed';
export type NovelStatus = 'analyzed' | 'crawling' | 'completed' | 'failed';

export type Novel = {
  id: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
  status: NovelStatus;
  createdAt: string;
  updatedAt: string;
  autoUpdateEnabled?: boolean;
  updateIntervalMinutes?: AutoUpdateInterval;
  lastUpdateCheckAt?: string;
  nextUpdateCheckAt?: string;
  lastUpdateResult?: NovelUpdateResultCode;
  consecutiveUpdateFailures?: number;
  chapterCount?: number;
  fetchedChapterCount?: number;
  failedChapterCount?: number;
  firstChapterIndex?: number;
};

export type PaginatedNovels = {
  items: Novel[];
  total: number;
  limit: number;
  offset: number;
};
