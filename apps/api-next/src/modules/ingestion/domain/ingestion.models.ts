export type IngestionJobStatus =
  'queued' | 'running' | 'pausing' | 'paused' | 'resuming' | 'completed' | 'failed' | 'cancelled';

export type IngestionJobOutcome = 'success' | 'partial' | 'failure';
export type IngestionEventLevel = 'info' | 'success' | 'warning' | 'error';
export type IngestionEventType =
  | 'job_created'
  | 'started'
  | 'chapter_started'
  | 'chapter_succeeded'
  | 'chapter_failed'
  | 'chapter_retry'
  | 'pause_requested'
  | 'paused'
  | 'resume_requested'
  | 'resumed'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'recovered_paused';

export interface IngestionJob {
  id: string;
  novelId: string;
  status: IngestionJobStatus;
  outcome?: IngestionJobOutcome;
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
}

export interface IngestionEvent {
  id: string;
  jobId: string;
  type: IngestionEventType;
  level: IngestionEventLevel;
  message: string;
  chapterId?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  attempt?: number;
  createdAt: string;
}

export interface IngestionSummary {
  activeCount: number;
}
