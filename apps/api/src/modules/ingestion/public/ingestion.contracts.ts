import type { LibraryNovelDetail } from '../../library/public/library.api.js';
import type {
  IngestionEvent,
  IngestionJob,
  IngestionJobStatus,
  IngestionSummary
} from '../domain/ingestion.models.js';

export interface AnalyzeNovelCommand {
  commandId: string;
  url: string;
  requestedAt: string;
}

export interface CreateIngestionJobCommand {
  commandId: string;
  novelId: string;
  requestedAt: string;
}

export interface JobIdentityCommand {
  commandId: string;
  jobId: string;
  requestedAt: string;
}

export interface RefreshNovelCommand {
  commandId: string;
  novelId: string;
  requestedAt: string;
}

export interface NovelIngestionCommand {
  novelId: string;
}

export interface ListIngestionJobsQuery {
  limit: number;
  status?: IngestionJobStatus;
}

export interface IngestionCommands {
  analyzeNovel(command: AnalyzeNovelCommand): Promise<LibraryNovelDetail>;
  createJob(command: CreateIngestionJobCommand): Promise<IngestionJob>;
  pauseJob(command: JobIdentityCommand): Promise<void>;
  resumeJob(command: JobIdentityCommand): Promise<void>;
  cancelJob(command: JobIdentityCommand): Promise<void>;
  cancelNovelJobs(command: NovelIngestionCommand): Promise<void>;
  purgeNovelJobs(command: NovelIngestionCommand): Promise<void>;
  refreshNovel(command: RefreshNovelCommand): Promise<IngestionJob | null>;
}

export interface IngestionQueries {
  listJobs(query: ListIngestionJobsQuery): Promise<IngestionJob[]>;
  getJob(id: string): Promise<IngestionJob | null>;
  getJobEvents(id: string): Promise<IngestionEvent[]>;
  getNovelJob(novelId: string): Promise<IngestionJob | null>;
  getSummary(): Promise<IngestionSummary>;
}
