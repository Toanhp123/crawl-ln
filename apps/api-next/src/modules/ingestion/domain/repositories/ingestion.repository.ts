import type { IngestionJob, IngestionJobStatus } from '../ingestion.models.js';

export interface IngestionRepository {
  create(job: IngestionJob, chapterIds?: readonly string[]): Promise<void>;
  createForCommand(
    commandId: string,
    job: IngestionJob,
    chapterIds?: readonly string[]
  ): Promise<{ job: IngestionJob; created: boolean }>;
  update(job: IngestionJob): Promise<void>;
  findById(id: string): Promise<IngestionJob | null>;
  findChapterIds(jobId: string): Promise<string[]>;
  findByNovelId(novelId: string): Promise<IngestionJob | null>;
  findAll(limit?: number, status?: IngestionJobStatus): Promise<IngestionJob[]>;
  countActive(): Promise<number>;
  findRecoverable(limit?: number): Promise<IngestionJob[]>;
  findInterrupted(limit?: number): Promise<IngestionJob[]>;
  hasActiveForNovel(novelId: string): Promise<boolean>;
}
