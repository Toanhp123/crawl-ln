import { z } from 'zod';

export const AnalyzeNovelRequestSchema = z.object({
  url: z.string().url()
});

export const CrawlNovelRequestSchema = z.object({
  novelId: z.string().min(1)
});

export const IdParamsSchema = z.object({
  id: z.string().min(1)
});

export const ChapterParamsSchema = z.object({
  id: z.string().min(1),
  index: z.coerce.number().int().nonnegative()
});

export const ListNovelsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z
    .enum(['all', 'completed', 'active', 'analyzed', 'crawling', 'failed', 'importing'])
    .default('all'),
  sort: z.enum(['recent', 'created', 'title', 'chapters']).default('recent'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  ids: z.string().max(5000).optional(),
  excludeIds: z.string().max(5000).optional(),
  readingOrder: z.string().max(5000).optional()
});

export const ExportFormatSchema = z.enum(['epub', 'txt']);

export const ExportChapterRangeSchema = z
  .object({
    from: z.coerce.number().int().nonnegative().optional(),
    to: z.coerce.number().int().nonnegative().optional()
  })
  .refine((range) => range.from === undefined || range.to === undefined || range.from <= range.to, {
    message: 'from must be less than or equal to to'
  });

export const ExportNovelRequestSchema = z.object({
  format: z.enum(['epub', 'txt']),
  range: ExportChapterRangeSchema.optional(),
  downloadedOnly: z.boolean().default(true)
});

export const AutoUpdateIntervalSchema = z.union([
  z.literal(0),
  z.literal(360),
  z.literal(720),
  z.literal(1440),
  z.literal(10080)
]);

export const UpdateNovelPolicyRequestSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: AutoUpdateIntervalSchema
});

export type AutoUpdateInterval = z.infer<typeof AutoUpdateIntervalSchema>;
export type UpdateNovelPolicyRequest = z.infer<typeof UpdateNovelPolicyRequestSchema>;

export type NovelUpdateResultCode =
  'idle' | 'up_to_date' | 'queued' | 'skipped_active_task' | 'failed';

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

export type AnalyzeNovelRequest = z.infer<typeof AnalyzeNovelRequestSchema>;
export type CrawlNovelRequest = z.infer<typeof CrawlNovelRequestSchema>;

export const CreateCrawlJobRequestSchema = CrawlNovelRequestSchema;
export const CrawlJobParamsSchema = IdParamsSchema;

export type CreateCrawlJobRequest = z.infer<typeof CreateCrawlJobRequestSchema>;
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
export type ExportNovelRequest = z.infer<typeof ExportNovelRequestSchema>;
export type ExportChapterRange = z.infer<typeof ExportChapterRangeSchema>;

export type NovelStatus = 'analyzed' | 'crawling' | 'completed' | 'failed';
export type ChapterStatus = 'pending' | 'fetched' | 'failed';
export type TaskStatus =
  'queued' | 'running' | 'pausing' | 'paused' | 'resuming' | 'completed' | 'failed' | 'cancelled';
export type TaskOutcome = 'success' | 'partial' | 'failure';
export type CrawlEventLevel = 'info' | 'success' | 'warning' | 'error';
export type CrawlEventType =
  | 'task_created'
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

export type TaskSummary = {
  activeCount: number;
};

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

export type CrawlEvent = {
  id: string;
  taskId: string;
  type: CrawlEventType;
  level: CrawlEventLevel;
  message: string;
  chapterId?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  attempt?: number;
  createdAt: string;
};

export type ChapterPreview = {
  index: number;
  title: string;
  url: string;
};

export type AnalyzeNovelResult = {
  title: string;
  sourceUrl: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  chapters: ChapterPreview[];
  diagnostics?: {
    chapterCount: number;
    firstChapterUrls: string[];
  };
};

export type ChapterContentResult = {
  title: string;
  url: string;
  rawText: string;
  cleanText: string;
};

export type NovelDetail = {
  novel: Novel;
  chapters: Chapter[];
};

export type PaginatedNovels = {
  items: Novel[];
  total: number;
  limit: number;
  offset: number;
};

export type NovelStats = {
  novels: number;
  analyzed: number;
  crawling: number;
  completed: number;
  failed: number;
};

export type ApiSuccess<T> = {
  data: T;
  error: null;
};

export type SourceReaderApiErrorCode =
  | 'SOURCE_NOT_SUPPORTED'
  | 'CAPABILITY_NOT_SUPPORTED'
  | 'PLUGIN_UNAVAILABLE'
  | 'PLUGIN_DISABLED'
  | 'PLUGIN_QUARANTINED'
  | 'PLUGIN_CONTRACT_INCOMPATIBLE'
  | 'PLUGIN_PERMISSION_DENIED'
  | 'PLUGIN_NETWORK_PERMISSION_DENIED'
  | 'PLUGIN_RESULT_INVALID'
  | 'PLUGIN_PACKAGE_INVALID'
  | 'EXTERNAL_RUNTIME_UNSUPPORTED'
  | 'PLUGIN_SANDBOX_START_FAILED'
  | 'PLUGIN_SANDBOX_POLICY_VIOLATION'
  | 'PLUGIN_RPC_PROTOCOL_INVALID'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_FAILED'
  | 'CREDENTIAL_NOT_CONFIGURED'
  | 'CREDENTIAL_UNAVAILABLE'
  | 'SESSION_EXPIRED'
  | 'SESSION_NETWORK_MISMATCH'
  | 'SESSION_BINDING_MISMATCH'
  | 'SESSION_UNAVAILABLE'
  | 'AUTH_CHALLENGE_REQUIRED'
  | 'AUTH_CHALLENGE_EXPIRED'
  | 'NETWORK_ROUTE_REQUIRED'
  | 'NETWORK_REGION_UNAVAILABLE'
  | 'NETWORK_ROUTE_OFFLINE'
  | 'NETWORK_ROUTE_UNAVAILABLE'
  | 'NETWORK_ROUTE_UNSUPPORTED'
  | 'NETWORK_ROUTE_TEST_FAILED'
  | 'NETWORK_ACCESS_BLOCKED'
  | 'NETWORK_CREDENTIAL_UNAVAILABLE'
  | 'SOURCE_REQUEST_TIMEOUT'
  | 'SOURCE_RESPONSE_TOO_LARGE'
  | 'SOURCE_RATE_LIMITED'
  | 'SOURCE_TEMPORARILY_UNAVAILABLE'
  | 'CACHE_SCOPE_IDENTITY_MISSING'
  | 'CURSOR_INVALID'
  | 'CURSOR_INVALIDATED'
  | 'SECRET_VAULT_UNAVAILABLE'
  | 'SOURCE_READER_CANCELLED'
  | 'SOURCE_READER_INTERNAL_ERROR';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | SourceReaderApiErrorCode;
export type ApiFailure = {
  data: null;
  error: { code: ApiErrorCode; message: string; details: unknown | null };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  type: z.enum(['all', 'novel', 'chapter']).default('all'),
  novelId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  ids: z.string().max(5000).optional(),
  excludeIds: z.string().max(5000).optional(),
  readingOrder: z.string().max(5000).optional()
});
export type SearchDocumentType = 'all' | 'novel' | 'chapter';
export type SearchResultItem = {
  type: 'novel' | 'chapter';
  documentId: string;
  novelId: string;
  novelTitle: string;
  chapterIndex?: number;
  title: string;
  snippet: string;
};
export type SearchResultPage = {
  query: string;
  total: number;
  limit: number;
  offset: number;
  items: SearchResultItem[];
};

export type UpdateNovelResult = {
  novel: NovelDetail;
  newChapterCount: number;
  pendingChapterCount: number;
  task: CrawlTask | null;
};

export type BackupRestoreMode = 'replace' | 'merge';
export type BackupSettingsMode = 'keep-current' | 'use-backup';
export type BackupRestoreResult = {
  mode: BackupRestoreMode;
  restored: Record<string, number>;
  settings: Record<string, unknown> | null;
  safetyBackupPath: string | null;
};

export interface SourceReaderPluginDescriptor {
  id: string;
  name: string;
  activeVersion?: string;
  trustLevel: 'built-in' | 'signed' | 'local-unverified' | 'blocked';
  status:
    | 'installed'
    | 'pending-approval'
    | 'initializing'
    | 'active'
    | 'degraded'
    | 'disabled'
    | 'quarantined'
    | 'failed';
  enabled: boolean;
  capabilities: string[];
  domains: string[];
  permissionsPending: boolean;
  health?: {
    status: 'healthy' | 'degraded' | 'failed';
    lastCheckedAt?: string;
  };
}

export type RealtimeResource = 'novels' | 'tasks' | 'scheduler' | 'plugins' | 'search' | 'all';

export type RealtimeEvent = {
  id: string;
  type: 'data.changed';
  resources: RealtimeResource[];
  reason: string;
  occurredAt: string;
  taskId?: string;
  novelId?: string;
  chapterIndex?: number;
};

export type RealtimeEventInput = Omit<RealtimeEvent, 'id' | 'occurredAt'>;
