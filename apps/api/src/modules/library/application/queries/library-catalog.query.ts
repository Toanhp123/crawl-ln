import type { PaginatedLibraryNovels } from '../../domain/library.models.js';
import type {
  LibraryCatalogQuery,
  LibraryRepository
} from '../../domain/repositories/library.repository.js';

export type { LibraryCatalogQuery } from '../../domain/repositories/library.repository.js';

export class LibraryCatalogQueryService {
  constructor(private readonly repository: LibraryRepository) {}

  listNovels(query: LibraryCatalogQuery): Promise<PaginatedLibraryNovels> {
    return this.repository.listNovels(query);
  }
}
