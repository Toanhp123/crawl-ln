import type { LibraryCommands, LibraryQueries } from './library.contracts.js';

export interface LibraryApi {
  commands: LibraryCommands;
  queries: LibraryQueries;
}

export type {
  DeleteLibraryNovelCommand,
  LibraryCommands,
  LibraryQueries,
  ListLibraryNovelsQuery,
  ReconcileAnalysisCommand,
  SaveChapterContentCommand,
  SetLibraryIngestionStateCommand
} from './library.contracts.js';
export {
  LIBRARY_ANALYSIS_RECONCILED,
  LIBRARY_CHAPTER_CONTENT_SAVED,
  LIBRARY_NOVEL_DELETED
} from './library.events.js';
export type {
  LibraryAnalysisReconciledPayload,
  LibraryChapterContentSavedPayload,
  LibraryNovelDeletedPayload
} from './library.events.js';
export type {
  LibraryChapter,
  LibraryChapterStatus,
  LibraryNovel,
  LibraryNovelDetail,
  LibraryNovelStatus,
  LibraryStats,
  PaginatedLibraryNovels
} from '../domain/library.models.js';
