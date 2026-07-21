import { createIngestionModule } from '../modules/ingestion/ingestion.module.js';
import { createLibraryModule } from '../modules/library/library.module.js';
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
  const sourceReader = createSourceReaderModule({ database, environment, clock, logger });
  modules.register(createLibraryModule(database), createIngestionModule(), sourceReader);
  const migrations = modules.migrationRegistry();
  const events = new InMemoryEventBus();
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
    sourceReader: sourceReader.presentation
  });

  return { lifecycle, presentation };
}
