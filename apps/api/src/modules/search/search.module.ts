import type { SqliteDatabase } from '../../platform/database/sqlite-database.js';
import type { EventBus } from '../../platform/events/event-bus.js';
import {
  LIBRARY_ANALYSIS_RECONCILED,
  LIBRARY_CHAPTER_CONTENT_SAVED,
  LIBRARY_NOVEL_DELETED,
  type LibraryQueries
} from '../library/public/library.api.js';
import { SearchQueryService } from './application/queries/search-query.service.js';
import { LibrarySearchProjectionService } from './application/services/library-search-projection.service.js';
import { SearchIndexMaintenanceService } from './application/services/search-index-maintenance.service.js';
import { SearchBackupContributor } from './infrastructure/backup/search-backup.contributor.js';
import { EventBusSearchRebuildLifecyclePublisher } from './infrastructure/events/event-bus-search-rebuild-lifecycle.publisher.js';
import { LibrarySearchEventHandler } from './infrastructure/events/library-search-event.handler.js';
import { LibraryQuerySearchSourceAdapter } from './infrastructure/library/library-query-search-source.adapter.js';
import { searchMigrations } from './infrastructure/migrations/search.migrations.js';
import { SearchSqliteRepository } from './infrastructure/sqlite/search-sqlite.repository.js';
import { SearchController } from './presentation/search.controller.js';
import type { SearchApi } from './public/search.api.js';

interface SearchModuleOptions {
  database: SqliteDatabase;
  library: LibraryQueries;
  events: EventBus;
  clock: { now(): Date };
  ids: { randomId(): string };
}

export function createSearchModule(options: SearchModuleOptions) {
  const repository = new SearchSqliteRepository(options.database);
  const queries = new SearchQueryService(repository);
  const maintenance = new SearchIndexMaintenanceService(
    new LibraryQuerySearchSourceAdapter(options.library),
    repository,
    new EventBusSearchRebuildLifecyclePublisher(options.events, options.clock, options.ids),
    options.clock
  );
  const eventHandler = new LibrarySearchEventHandler(
    new LibrarySearchProjectionService(repository),
    options.clock
  );
  const api: SearchApi = {
    commands: { rebuild: () => maintenance.rebuild() },
    queries: {
      search: (query) => queries.execute(query),
      status: () => maintenance.getStatus()
    }
  };
  let unsubscribers: Array<() => void> = [];

  return {
    name: 'search',
    migrations: searchMigrations,
    api,
    backup: new SearchBackupContributor(api.commands),
    presentation: { controller: new SearchController(api) },
    async start() {
      if (unsubscribers.length > 0) return;
      unsubscribers = [
        options.events.subscribe(LIBRARY_ANALYSIS_RECONCILED, (event) =>
          eventHandler.handle(event)
        ),
        options.events.subscribe(LIBRARY_CHAPTER_CONTENT_SAVED, (event) =>
          eventHandler.handle(event)
        ),
        options.events.subscribe(LIBRARY_NOVEL_DELETED, (event) => eventHandler.handle(event))
      ];
    },
    async stop() {
      for (const unsubscribe of unsubscribers) unsubscribe();
      unsubscribers = [];
    }
  };
}

export type SearchModule = ReturnType<typeof createSearchModule>;
