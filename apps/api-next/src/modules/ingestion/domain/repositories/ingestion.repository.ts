import type {
  IngestionEvent,
  IngestionJob,
  IngestionJobChapter,
  IngestionJobStatus
} from '../ingestion.models.js';

export interface IngestionRepository {
  create(job: IngestionJob, chapterIds?: readonly string[]): Promise<void>;
  createForCommand(
    commandId: string,
    job: IngestionJob,
    chapterIds?: readonly string[]
  ): Promise<{ job: IngestionJob; created: boolean }>;
  hasCommandReceipt(commandId: string, commandType: string): Promise<boolean>;
  recordCommandReceipt(commandId: string, commandType: string, createdAt: string): Promise<void>;
  update(job: IngestionJob): Promise<void>;
  saveJobWithEvent(job: IngestionJob, event: IngestionEvent): Promise<void>;
  recordChapterResult(
    job: IngestionJob,
    chapter: IngestionJobChapter,
    event: IngestionEvent
  ): Promise<void>;
  findById(id: string): Promise<IngestionJob | null>;
  findChapterIds(jobId: string): Promise<string[]>;
  findJobChapters(jobId: string): Promise<IngestionJobChapter[]>;
  findEvents(jobId: string, limit?: number): Promise<IngestionEvent[]>;
  findByNovelId(novelId: string): Promise<IngestionJob | null>;
  findAll(limit?: number, status?: IngestionJobStatus): Promise<IngestionJob[]>;
  countActive(): Promise<number>;
  findRecoverable(limit?: number): Promise<IngestionJob[]>;
  findInterrupted(limit?: number): Promise<IngestionJob[]>;
  hasActiveForNovel(novelId: string): Promise<boolean>;
}
