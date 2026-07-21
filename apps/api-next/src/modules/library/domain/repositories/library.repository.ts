import type {
  DeleteLibraryNovelCommand,
  ListLibraryNovelsQuery,
  ReconcileAnalysisCommand,
  SaveChapterContentCommand,
  SetLibraryIngestionStateCommand
} from '../library.contracts.js';
import type {
  LibraryChapter,
  LibraryNovelDetail,
  LibraryStats,
  PaginatedLibraryNovels
} from '../library.models.js';

export interface LibraryRepository {
  findNovelById(id: string): Promise<LibraryNovelDetail | null>;
  findNovelBySourceUrl(sourceUrl: string): Promise<LibraryNovelDetail | null>;
  listNovels(query: ListLibraryNovelsQuery): Promise<PaginatedLibraryNovels>;
  getStats(): Promise<LibraryStats>;
  getChapter(novelId: string, chapterIndex: number): Promise<LibraryChapter | null>;
}

export interface LibraryUnitOfWork {
  reconcileAnalysis(command: ReconcileAnalysisCommand): LibraryNovelDetail;
  saveChapterContent(command: SaveChapterContentCommand): LibraryChapter;
  setIngestionState(command: SetLibraryIngestionStateCommand): void;
  deleteNovel(command: DeleteLibraryNovelCommand): void;
}
