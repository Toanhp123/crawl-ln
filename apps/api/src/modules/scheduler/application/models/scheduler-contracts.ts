export type AutoUpdateInterval = 0 | 360 | 720 | 1440 | 10080;
export type NovelUpdateResultCode =
  'idle' | 'up_to_date' | 'queued' | 'skipped_active_task' | 'failed';
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
  updateIntervalMinutes?: AutoUpdateInterval;
  lastUpdateCheckAt?: string;
  nextUpdateCheckAt?: string;
  lastUpdateResult?: NovelUpdateResultCode;
  consecutiveUpdateFailures?: number;
};
export type Chapter = {
  id: string;
  novelId: string;
  index: number;
  title: string;
  sourceUrl: string;
  rawText?: string;
  cleanText?: string;
  status: 'pending' | 'fetched' | 'failed';
  errorMessage?: string;
  contentVersion: number;
};
export type CrawlTask = {
  id: string;
  novelId: string;
  status:
    'queued' | 'running' | 'pausing' | 'paused' | 'resuming' | 'completed' | 'failed' | 'cancelled';
  outcome?: 'success' | 'partial' | 'failure';
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
export type SchedulerStatus = {
  running: boolean;
  tickIntervalMs: number;
  monitoredNovels: number;
  dueNovels: number;
  activeRuns: number;
  lastTickAt?: string;
  nextTickAt?: string;
  lastTickDurationMs?: number;
};
export type NovelUpdateDiagnostic = {
  id: string;
  novelId: string;
  sourceName: string;
  result: NovelUpdateResultCode;
  message: string;
  newChapterCount: number;
  pendingChapterCount: number;
  durationMs: number;
  createdAt: string;
};
