import { DeleteLibraryNovelCommandHandler } from './application/commands/delete-library-novel.command.js';
import { ReconcileAnalysisCommandHandler } from './application/commands/reconcile-analysis.command.js';
import { SaveChapterContentCommandHandler } from './application/commands/save-chapter-content.command.js';
import { SetIngestionStateCommandHandler } from './application/commands/set-ingestion-state.command.js';
import { LibraryCatalogQueryService } from './application/queries/library-catalog.query.js';
import { LibraryQueriesService } from './application/queries/library-queries.service.js';
import { libraryMigrations } from './index.js';
import { LibraryBackupContributor } from './infrastructure/backup/library-backup.contributor.js';
import { LibrarySqliteOutboxSource } from './infrastructure/sqlite/library-sqlite.outbox-source.js';
import { LibrarySqliteRepository } from './infrastructure/sqlite/library-sqlite.repository.js';
import { LibrarySqliteUnitOfWork } from './infrastructure/sqlite/library-sqlite.unit-of-work.js';
import type { LibraryApi } from './public/library.api.js';
import type { SqliteDatabase } from '../../platform/database/sqlite-database.js';

export function createLibraryModule(database: SqliteDatabase) {
  const repository = new LibrarySqliteRepository(database);
  const unitOfWork = new LibrarySqliteUnitOfWork(database, repository);
  const reconcileAnalysis = new ReconcileAnalysisCommandHandler(unitOfWork);
  const saveChapterContent = new SaveChapterContentCommandHandler(unitOfWork);
  const setIngestionState = new SetIngestionStateCommandHandler(unitOfWork);
  const deleteNovel = new DeleteLibraryNovelCommandHandler(unitOfWork);
  const queries = new LibraryQueriesService(repository);
  const catalog = new LibraryCatalogQueryService(repository);
  const api: LibraryApi = {
    commands: {
      reconcileAnalysis: (command) => reconcileAnalysis.execute(command),
      saveChapterContent: (command) => saveChapterContent.execute(command),
      setIngestionState: (command) => setIngestionState.execute(command),
      deleteNovel: (command) => deleteNovel.execute(command)
    },
    queries
  };

  return {
    name: 'library',
    migrations: libraryMigrations,
    api,
    application: { catalog },
    backup: new LibraryBackupContributor(database),
    outbox: new LibrarySqliteOutboxSource(database)
  };
}
