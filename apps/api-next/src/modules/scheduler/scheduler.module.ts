import type { IngestionCommands } from '../ingestion/public/ingestion.api.js';
import type { LibraryQueries } from '../library/public/library.api.js';
import type { SqliteDatabase } from '../../platform/database/sqlite-database.js';
import type { ApplicationEvent } from '../../platform/events/application-event.js';
import type { EventBus } from '../../platform/events/event-bus.js';
import { UpdateSchedulerPolicyCommandHandler } from './application/commands/update-scheduler-policy.command.js';
import {
  SCHEDULER_DIAGNOSTIC_RECORDED,
  type SchedulerDiagnosticRecordedPayload
} from './application/events/scheduler-diagnostic.event.js';
import { RecordSchedulerDiagnosticHandler } from './application/handlers/record-scheduler-diagnostic.handler.js';
import { SchedulerQueriesService } from './application/queries/scheduler-queries.service.js';
import { SchedulerTickService } from './application/services/scheduler-tick.service.js';
import { EventBusSchedulerDiagnosticPublisher } from './infrastructure/events/event-bus-scheduler-diagnostic.publisher.js';
import { schedulerMigrations } from './infrastructure/migrations/001-scheduler-schema.js';
import { SchedulerSqliteRepository } from './infrastructure/sqlite/scheduler-sqlite.repository.js';
import { SchedulerController } from './presentation/scheduler.controller.js';
import type { SchedulerApi } from './public/scheduler.api.js';

interface SchedulerModuleOptions {
  database: SqliteDatabase;
  library: LibraryQueries;
  ingestion: Pick<IngestionCommands, 'refreshNovel'>;
  events: EventBus;
  clock: { now(): Date };
  ids: { randomId(): string };
  logger: { error(message: string): void };
  tickIntervalMs?: number;
}

export function createSchedulerModule(options: SchedulerModuleOptions) {
  const repository = new SchedulerSqliteRepository(options.database);
  const updatePolicy = new UpdateSchedulerPolicyCommandHandler(
    options.library,
    repository,
    options.clock
  );
  const queries = new SchedulerQueriesService(repository);
  const diagnosticHandler = new RecordSchedulerDiagnosticHandler(repository);
  const scheduler = new SchedulerTickService(
    repository,
    options.library,
    options.ingestion,
    new EventBusSchedulerDiagnosticPublisher(options.events, options.clock, options.ids),
    options.clock,
    options.ids,
    options.logger,
    options.tickIntervalMs
  );
  const api: SchedulerApi = {
    commands: { updatePolicy: (command) => updatePolicy.execute(command) },
    queries: {
      status: () => scheduler.status(),
      listDiagnostics: (novelId) => queries.listDiagnostics(novelId)
    },
    lifecycle: { tick: () => scheduler.tick() }
  };
  let unsubscribe: (() => void) | undefined;

  return {
    name: 'scheduler',
    migrations: schedulerMigrations,
    api,
    presentation: { controller: new SchedulerController(api) },
    async start() {
      unsubscribe ??= options.events.subscribe<SchedulerDiagnosticRecordedPayload>(
        SCHEDULER_DIAGNOSTIC_RECORDED,
        (event: ApplicationEvent<SchedulerDiagnosticRecordedPayload>) =>
          diagnosticHandler.handle(event.payload)
      );
      scheduler.start();
    },
    async stop() {
      await scheduler.stop();
      unsubscribe?.();
      unsubscribe = undefined;
    }
  };
}

export type SchedulerModule = ReturnType<typeof createSchedulerModule>;
