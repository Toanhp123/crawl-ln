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
export type {
  LibraryChapter,
  LibraryChapterStatus,
  LibraryNovel,
  LibraryNovelDetail,
  LibraryNovelStatus,
  LibraryStats,
  PaginatedLibraryNovels
} from '../domain/library.models.js';
