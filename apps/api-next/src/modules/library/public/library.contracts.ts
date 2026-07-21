import type {
  LibraryChapter,
  LibraryNovelDetail,
  LibraryStats,
  PaginatedLibraryNovels
} from '../domain/library.models.js';
import type {
  DeleteLibraryNovelCommand,
  ListLibraryNovelsQuery,
  ReconcileAnalysisCommand,
  SaveChapterContentCommand,
  SetLibraryIngestionStateCommand
} from '../domain/library.contracts.js';

export type {
  DeleteLibraryNovelCommand,
  ListLibraryNovelsQuery,
  ReconcileAnalysisCommand,
  SaveChapterContentCommand,
  SetLibraryIngestionStateCommand
} from '../domain/library.contracts.js';

export interface LibraryCommands {
  reconcileAnalysis(command: ReconcileAnalysisCommand): Promise<LibraryNovelDetail>;
  saveChapterContent(command: SaveChapterContentCommand): Promise<LibraryChapter>;
  setIngestionState(command: SetLibraryIngestionStateCommand): Promise<void>;
  deleteNovel(command: DeleteLibraryNovelCommand): Promise<void>;
}

export interface LibraryQueries {
  listNovels(query: ListLibraryNovelsQuery): Promise<PaginatedLibraryNovels>;
  getNovel(id: string): Promise<LibraryNovelDetail | null>;
  getChapter(novelId: string, chapterIndex: number): Promise<LibraryChapter | null>;
  getStats(): Promise<LibraryStats>;
}
