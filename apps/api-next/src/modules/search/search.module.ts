import {
  LIBRARY_ANALYSIS_RECONCILED,
  LIBRARY_CHAPTER_CONTENT_SAVED,
  LIBRARY_NOVEL_DELETED,
  type LibraryQueries
} from '../library/public/library.api.js';
import type { EventBus } from '../../platform/events/event-bus.js';
import { RebuildSearchIndexCommandHandler } from './application/commands/rebuild-search-index.command.js';
import { SearchQueryService } from './application/queries/search-query.service.js';
import { LibrarySearchProjectionService } from './application/services/library-search-projection.service.js';
import { LibrarySearchEventHandler } from './infrastructure/events/library-search-event.handler.js';
import { LibraryQuerySearchSourceAdapter } from './infrastructure/library/library-query-search-source.adapter.js';
import { searchMigrations } from './infrastructure/migrations/001-search-schema.js';
import { SearchSqliteRepository } from './infrastructure/sqlite/search-sqlite.repository.js';
import { SearchController } from './presentation/search.controller.js';
import type { SearchApi } from './public/search.api.js';
import type { SqliteDatabase } from '../../platform/database/sqlite-database.js';

interface SearchModuleOptions {
  database: SqliteDatabase;
  library: LibraryQueries;
  events: EventBus;
  clock: { now(): Date };
}

export function createSearchModule(options: SearchModuleOptions) {
  const repository = new SearchSqliteRepository(options.database);
  const queries = new SearchQueryService(repository);
  const rebuild = new RebuildSearchIndexCommandHandler(
    new LibraryQuerySearchSourceAdapter(options.library),
    repository
  );
  const eventHandler = new LibrarySearchEventHandler(
    new LibrarySearchProjectionService(repository),
    options.clock
  );
  const api: SearchApi = {
    commands: { rebuild: () => rebuild.execute() },
    queries: { search: (query) => queries.execute(query) }
  };
  let unsubscribers: Array<() => void> = [];

  return {
    name: 'search',
    migrations: searchMigrations,
    api,
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
