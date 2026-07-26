import type { LibraryApi } from '../library/public/library.api.js';
import { CreateIngestionJobCommandHandler } from './application/commands/create-ingestion-job.command.js';
import {
  CancelJobCommandHandler,
  CancelNovelJobsCommandHandler,
  PauseJobCommandHandler,
  PurgeNovelJobsCommandHandler,
  ResumeJobCommandHandler
} from './application/commands/job-control.commands.js';
import type { IngestionIdGeneratorPort } from './application/ports/id-generator.port.js';
import type { IngestionSourceReaderPort } from './application/ports/source-reader.port.js';
import { IngestionQueriesService } from './application/queries/ingestion-queries.service.js';
import { AnalyzeNovelWorkflow } from './application/services/analyze-novel.workflow.js';
import { AnalyzeSourcePreviewService } from './application/services/analyze-source-preview.service.js';
import { ChapterFetchService } from './application/services/chapter-fetch.service.js';
import { IngestionJobRunnerService } from './application/services/ingestion-job-runner.service.js';
import { IngestionQueueService } from './application/services/ingestion-queue.service.js';
import { RefreshNovelWorkflow } from './application/services/refresh-novel.workflow.js';
import { RefreshNovelSummaryService } from './application/services/refresh-novel-summary.service.js';
import { ResumePausedJobsService } from './application/services/resume-paused-jobs.service.js';
import { SourceResultPolicyService } from './application/services/source-result-policy.service.js';
import { IngestionSqliteOutboxSource } from './infrastructure/sqlite/ingestion-sqlite.outbox-source.js';
import { IngestionBackupContributor } from './infrastructure/backup/ingestion-backup.contributor.js';
import { IngestionSqliteRepository } from './infrastructure/sqlite/ingestion-sqlite.repository.js';
import { ingestionMigrations } from './index.js';
import type { IngestionApi } from './public/ingestion.api.js';
import type { SqliteDatabase } from '../../platform/database/sqlite-database.js';

interface IngestionModuleOptions {
  database: SqliteDatabase;
  library: LibraryApi;
  sourceReader: IngestionSourceReaderPort;
  ids: IngestionIdGeneratorPort;
  clock: { now(): Date };
  logger: { error(message: string): void };
  retry?: number;
}

interface IngestionModuleBase {
  name: 'ingestion';
  migrations: typeof ingestionMigrations;
}

interface CompleteIngestionModule extends IngestionModuleBase {
  api: IngestionApi;
  application: {
    analyzeSource: AnalyzeSourcePreviewService;
    jobEvents: Pick<IngestionQueriesService, 'getJobEvents'>;
    refreshNovelSummary: RefreshNovelSummaryService;
    resumePausedJobs: ResumePausedJobsService;
  };
  backup: IngestionBackupContributor;
  maintenance: { begin(): void; end(): void };
  outbox: IngestionSqliteOutboxSource;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createIngestionModule(): IngestionModuleBase;
export function createIngestionModule(options: IngestionModuleOptions): CompleteIngestionModule;
export function createIngestionModule(
  options?: IngestionModuleOptions
): IngestionModuleBase | CompleteIngestionModule {
  if (!options) return { name: 'ingestion', migrations: ingestionMigrations };

  const repository = new IngestionSqliteRepository(options.database);
  const sourcePolicy = new SourceResultPolicyService();
  const analyzeNovel = new AnalyzeNovelWorkflow(
    options.sourceReader,
    sourcePolicy,
    options.library.commands,
    options.ids
  );
  const analyzeSource = new AnalyzeSourcePreviewService(options.sourceReader, sourcePolicy);
  const fetchChapter = new ChapterFetchService(options.sourceReader, sourcePolicy);
  const runner = new IngestionJobRunnerService({
    repository,
    library: options.library,
    fetchChapter,
    clock: options.clock,
    ids: options.ids,
    retry: options.retry
  });
  const queue = new IngestionQueueService({
    repository,
    runner,
    clock: options.clock,
    ids: options.ids,
    logger: options.logger
  });
  const createJob = new CreateIngestionJobCommandHandler(
    options.library.queries,
    repository,
    queue,
    options.ids
  );
  const refreshNovel = new RefreshNovelWorkflow(options.library.queries, analyzeNovel, createJob);
  const pauseJob = new PauseJobCommandHandler(repository, queue);
  const resumeJob = new ResumeJobCommandHandler(repository, queue);
  const cancelJob = new CancelJobCommandHandler(repository, queue);
  const cancelNovelJobs = new CancelNovelJobsCommandHandler(repository, queue);
  const purgeNovelJobs = new PurgeNovelJobsCommandHandler(cancelNovelJobs, repository);
  const queries = new IngestionQueriesService(repository);
  const refreshNovelSummary = new RefreshNovelSummaryService(options.library.queries, refreshNovel);
  const resumePausedJobs = new ResumePausedJobsService(queries, resumeJob);
  const api: IngestionApi = {
    commands: {
      analyzeNovel: (command) => analyzeNovel.execute(command),
      createJob: (command) => createJob.execute(command),
      pauseJob: (command) => pauseJob.execute(command),
      resumeJob: (command) => resumeJob.execute(command),
      cancelJob: (command) => cancelJob.execute(command),
      cancelNovelJobs: (command) => cancelNovelJobs.execute(command),
      purgeNovelJobs: (command) => purgeNovelJobs.execute(command),
      refreshNovel: (command) => refreshNovel.execute(command)
    },
    queries: {
      listJobs: (query) => queries.listJobs(query),
      getJob: (id) => queries.getJob(id),
      getJobEvents: (id) => queries.getJobEvents(id),
      getNovelJob: (novelId) => queries.getNovelJob(novelId),
      getSummary: () => queries.getSummary()
    }
  };

  return {
    name: 'ingestion',
    migrations: ingestionMigrations,
    api,
    application: { analyzeSource, jobEvents: queries, refreshNovelSummary, resumePausedJobs },
    backup: new IngestionBackupContributor(options.database),
    maintenance: {
      begin: () => queue.beginMaintenance(),
      end: () => queue.endMaintenance()
    },
    outbox: new IngestionSqliteOutboxSource(options.database, options.clock),
    start: async () => {
      await queue.recoverInterrupted();
    },
    stop: () => queue.stop()
  };
}
