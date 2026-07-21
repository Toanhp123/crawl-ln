import { randomUUID } from 'node:crypto';
import { createExportModule } from '../modules/export/export.module.js';
import { createIngestionModule } from '../modules/ingestion/ingestion.module.js';
import {
  AxiosRobotsTextClient,
  RobotsTxtAccessPolicyAdapter
} from '../modules/ingestion/infrastructure/robots-txt-access-policy.adapter.js';
import { createLibraryModule } from '../modules/library/library.module.js';
import { createSchedulerModule } from '../modules/scheduler/scheduler.module.js';
import { createSearchModule } from '../modules/search/search.module.js';
import { createSourceReaderModule } from '../modules/source-reader/source-reader.module.js';
import type { NextEnvironment } from '../platform/config/environment.js';
import { runRegisteredMigrations } from '../platform/database/migration-runner.js';
import { SqliteDatabase } from '../platform/database/sqlite-database.js';
import { InMemoryEventBus } from '../platform/events/in-memory-event-bus.js';
import { OutboxDispatcher } from '../platform/events/outbox-dispatcher.js';
import { createAppLifecycle } from '../platform/lifecycle/app-lifecycle.js';
import { ConsoleLogger } from '../platform/logging/console-logger.js';
import { SystemClock } from '../platform/system/system-clock.js';
import { ModuleRegistry } from './module-registry.js';

export function createAppContainer(environment: NextEnvironment) {
  const database = new SqliteDatabase(environment.databasePath, { open: false });
  const modules = new ModuleRegistry();
  const clock = new SystemClock();
  const logger = new ConsoleLogger();
  const ids = { randomId: randomUUID };
  const events = new InMemoryEventBus();
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
    logger
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
  modules.register(library, sourceReader, ingestion, scheduler, search, exports);
  const migrations = modules.migrationRegistry();
  const outbox = new OutboxDispatcher(modules.outboxSources(), events, clock, logger, {
    batchSize: environment.outboxBatchSize
  });
  const lifecycle = createAppLifecycle({
    database,
    migrations: { run: () => runRegisteredMigrations(database, migrations) },
    modules: modules.list(),
    outbox: {
      start: () => outbox.start(environment.outboxIntervalMs),
      stop: () => outbox.stop()
    }
  });
  const presentation = Object.freeze({
    library: Object.freeze({ routePrefix: '/api/novels' }),
    ingestion: Object.freeze({ routePrefix: '/api/crawl' }),
    sourceReader: sourceReader.presentation,
    scheduler: scheduler.presentation,
    search: search.presentation,
    exports: exports.presentation
  });

  return { lifecycle, presentation };
}
