import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { createBackupModule } from '../modules/backup/backup.module.js';
import { BackupController } from '../modules/backup/presentation/backup.controller.js';
import { createExportModule } from '../modules/export/export.module.js';
import { createIngestionModule } from '../modules/ingestion/ingestion.module.js';
import { IngestionController } from '../modules/ingestion/presentation/ingestion.controller.js';
import {
  AxiosRobotsTextClient,
  RobotsTxtAccessPolicyAdapter
} from '../modules/ingestion/infrastructure/robots-txt-access-policy.adapter.js';
import { createLibraryModule } from '../modules/library/library.module.js';
import { LibraryController } from '../modules/library/presentation/library.controller.js';
import { createSchedulerModule } from '../modules/scheduler/scheduler.module.js';
import { createSearchModule } from '../modules/search/search.module.js';
import { createSourceReaderModule } from '../modules/source-reader/source-reader.module.js';
import type { Environment } from '../platform/config/environment.js';
import { runRegisteredMigrations } from '../platform/database/migration-runner.js';
import { SqliteDatabase } from '../platform/database/sqlite-database.js';
import { InMemoryEventBus } from '../platform/events/in-memory-event-bus.js';
import { OutboxDispatcher } from '../platform/events/outbox-dispatcher.js';
import { createAppLifecycle } from '../platform/lifecycle/app-lifecycle.js';
import { BackupMaintenanceCoordinator } from '../platform/lifecycle/backup-maintenance.coordinator.js';
import { ConsoleLogger } from '../platform/logging/console-logger.js';
import { ApplicationEventToRealtimeAdapter } from '../platform/realtime/application-event-to-realtime.adapter.js';
import { InMemoryRealtimeEventBroker } from '../platform/realtime/in-memory-realtime-event-broker.js';
import { RealtimeController } from '../platform/realtime/realtime.controller.js';
import { SystemClock } from '../platform/system/system-clock.js';
import { ModuleRegistry } from './module-registry.js';

export function createAppContainer(environment: Environment) {
  const database = new SqliteDatabase(environment.databasePath, { open: false });
  const modules = new ModuleRegistry();
  const clock = new SystemClock();
  const logger = new ConsoleLogger();
  const ids = { randomId: randomUUID };
  const events = new InMemoryEventBus();
  const realtime = new InMemoryRealtimeEventBroker(clock);
  const realtimeAdapter = new ApplicationEventToRealtimeAdapter(events, realtime);
  const library = createLibraryModule(database);
  const sourceReader = createSourceReaderModule({ database, environment, clock, logger });
  const ingestion = createIngestionModule({
    database,
    library: library.api,
    sourceReader: sourceReader.api,
    sourceAccessPolicy: new RobotsTxtAccessPolicyAdapter({
      http: new AxiosRobotsTextClient(),
      sourceAllowlist: environment.sourceAllowlist,
      defaultCrawlDelayMs: environment.crawlerDelayMs,
      requestTimeoutMs: environment.requestTimeoutMs ?? 15_000,
      now: () => clock.now().getTime()
    }),
    ids,
    clock,
    logger
  });
  const scheduler = createSchedulerModule({
    database,
    library: library.api.queries,
    ingestion: ingestion.api.commands,
    events,
    clock,
    ids,
    logger,
    realtime
  });
  const search = createSearchModule({
    database,
    library: library.api.queries,
    events,
    clock
  });
  const exports = createExportModule({
    library: library.api.queries,
    maxSourceBytes: environment.maxExportSourceBytes
  });
  modules.register(library, sourceReader, ingestion, scheduler, search, realtimeAdapter, exports);
  const outbox = new OutboxDispatcher(modules.outboxSources(), events, clock, logger, {
    batchSize: environment.outboxBatchSize
  });
  const outboxLifecycle = {
    start: () => outbox.start(environment.outboxIntervalMs),
    stop: () => outbox.stop()
  };
  const backups = createBackupModule({
    database,
    databasePath: environment.databasePath,
    storageDirectory: environment.storageDirectory ?? dirname(environment.databasePath),
    contributors: modules.backupContributors(),
    clock,
    appVersion: environment.appVersion ?? '3.0.0',
    schemaVersion: 1,
    maintenance: new BackupMaintenanceCoordinator(ingestion.maintenance, [
      outboxLifecycle,
      scheduler
    ])
  });
  modules.register(backups);
  const migrations = modules.migrationRegistry();
  const lifecycle = createAppLifecycle({
    database,
    migrations: { run: () => runRegisteredMigrations(database, migrations) },
    modules: modules.list(),
    outbox: outboxLifecycle
  });
  const libraryController = new LibraryController(
    library.api,
    library.application.catalog,
    ingestion.api,
    ingestion.application.refreshNovelSummary,
    scheduler.api.queries,
    clock,
    ids,
    realtime
  );
  const ingestionController = new IngestionController(
    ingestion.api,
    ingestion.application,
    clock,
    ids,
    realtime
  );
  const backupController = new BackupController(backups.api, realtime);
  const presentation = Object.freeze({
    realtime: new RealtimeController(realtime),
    library: Object.freeze({ controller: libraryController }),
    ingestion: Object.freeze({ controller: ingestionController }),
    sourceReader: sourceReader.presentation,
    scheduler: scheduler.presentation,
    search: search.presentation,
    exports: exports.presentation,
    backups: Object.freeze({ controller: backupController })
  });

  return { lifecycle, presentation };
}
