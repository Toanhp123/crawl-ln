import type { ListLibraryNovelsQuery } from '../../domain/library.contracts.js';
import type {
  LibraryChapter,
  LibraryNovelDetail,
  LibraryStats,
  PaginatedLibraryNovels
} from '../../domain/library.models.js';
import type { LibraryRepository } from '../../domain/repositories/library.repository.js';
import type { LibraryQueries } from '../../public/library.contracts.js';

export class LibraryQueriesService implements LibraryQueries {
  constructor(private readonly repository: LibraryRepository) {}

  listNovels(query: ListLibraryNovelsQuery): Promise<PaginatedLibraryNovels> {
    return this.repository.listNovels(query);
  }

  getNovel(id: string): Promise<LibraryNovelDetail | null> {
    return this.repository.findNovelById(id);
  }

  getChapter(novelId: string, chapterIndex: number): Promise<LibraryChapter | null> {
    return this.repository.getChapter(novelId, chapterIndex);
  }

  getStats(): Promise<LibraryStats> {
    return this.repository.getStats();
  }
}
