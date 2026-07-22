export type AutoUpdateInterval = 0 | 360 | 720 | 1440 | 10080;

export type SchedulerResultCode =
  'idle' | 'up_to_date' | 'queued' | 'skipped_active_task' | 'failed';

export interface SchedulerPolicy {
  novelId: string;
  enabled: boolean;
  intervalMinutes: AutoUpdateInterval;
  lastCheckAt?: string;
  nextCheckAt?: string;
  lastResult: SchedulerResultCode;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerDiagnostic {
  id: string;
  novelId: string;
  sourceName: string;
  result: SchedulerResultCode;
  message: string;
  newChapterCount: number;
  pendingChapterCount: number;
  durationMs: number;
  createdAt: string;
}

export interface SchedulerStatus {
  running: boolean;
  tickIntervalMs: number;
  monitoredNovels: number;
  dueNovels: number;
  activeRuns: number;
  lastTickAt?: string;
  nextTickAt?: string;
  lastTickDurationMs?: number;
}

export interface ScheduledNovel {
  id: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  status: 'analyzed' | 'crawling' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  autoUpdateEnabled: boolean;
  updateIntervalMinutes: AutoUpdateInterval;
  lastUpdateCheckAt?: string;
  nextUpdateCheckAt?: string;
  lastUpdateResult: SchedulerResultCode;
  consecutiveUpdateFailures: number;
}
