import type { IngestionCommands, IngestionQueries } from './ingestion.contracts.js';

export interface IngestionApi {
  commands: IngestionCommands;
  queries: IngestionQueries;
}

export type {
  AnalyzeNovelCommand,
  CreateIngestionJobCommand,
  IngestionCommands,
  IngestionQueries,
  JobIdentityCommand,
  ListIngestionJobsQuery,
  NovelIngestionCommand,
  RefreshNovelCommand
} from './ingestion.contracts.js';
export type {
  IngestionEvent,
  IngestionEventLevel,
  IngestionEventType,
  IngestionJob,
  IngestionJobOutcome,
  IngestionJobStatus,
  IngestionSummary
} from '../domain/ingestion.models.js';
