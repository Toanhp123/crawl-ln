import type { LibraryApi } from '../library/public/library.api.js';
import { CreateIngestionJobCommandHandler } from './application/commands/create-ingestion-job.command.js';
import {
  CancelJobCommandHandler,
  PauseJobCommandHandler,
  ResumeJobCommandHandler
} from './application/commands/job-control.commands.js';
import type { IngestionIdGeneratorPort } from './application/ports/id-generator.port.js';
import type { IngestionSourceReaderPort } from './application/ports/source-reader.port.js';
import { IngestionQueriesService } from './application/queries/ingestion-queries.service.js';
import { AnalyzeNovelWorkflow } from './application/services/analyze-novel.workflow.js';
import { ChapterFetchService } from './application/services/chapter-fetch.service.js';
import { IngestionJobRunnerService } from './application/services/ingestion-job-runner.service.js';
import { IngestionQueueService } from './application/services/ingestion-queue.service.js';
import { RefreshNovelWorkflow } from './application/services/refresh-novel.workflow.js';
import {
  SourcePolicyService,
  type SourceAccessPolicyPort
} from './application/services/source-policy.service.js';
import { IngestionSqliteOutboxSource } from './infrastructure/sqlite/ingestion-sqlite.outbox-source.js';
import { IngestionSqliteRepository } from './infrastructure/sqlite/ingestion-sqlite.repository.js';
import { ingestionMigrations } from './index.js';
import type { IngestionApi } from './public/ingestion.api.js';
import type { SqliteDatabase } from '../../platform/database/sqlite-database.js';

interface IngestionModuleOptions {
  database: SqliteDatabase;
  library: LibraryApi;
  sourceReader: IngestionSourceReaderPort;
  sourceAccessPolicy: SourceAccessPolicyPort;
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
  const sourcePolicy = new SourcePolicyService(options.sourceAccessPolicy);
  const analyzeNovel = new AnalyzeNovelWorkflow(
    options.sourceReader,
    sourcePolicy,
    options.library.commands,
    options.ids
  );
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
  const queries = new IngestionQueriesService(repository);
  const api: IngestionApi = {
    commands: {
      analyzeNovel: (command) => analyzeNovel.execute(command),
      createJob: (command) => createJob.execute(command),
      pauseJob: (command) => pauseJob.execute(command),
      resumeJob: (command) => resumeJob.execute(command),
      cancelJob: (command) => cancelJob.execute(command),
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
    outbox: new IngestionSqliteOutboxSource(options.database, options.clock),
    start: async () => {
      await queue.recoverInterrupted();
    },
    stop: () => queue.stop()
  };
}
