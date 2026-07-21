import type { LibraryQueries } from '../../../library/public/library.api.js';
import type { SearchLibrarySourcePort } from '../../application/ports/search-library-source.port.js';
import { novelProjectionDocuments } from '../../application/services/search-document.factory.js';
import type { SearchDocument } from '../../domain/search.models.js';

const pageSize = 100;

export class LibraryQuerySearchSourceAdapter implements SearchLibrarySourcePort {
  constructor(private readonly library: LibraryQueries) {}

  async listDocuments(): Promise<SearchDocument[]> {
    const documents: SearchDocument[] = [];
    let offset = 0;

    while (true) {
      const page = await this.library.listNovels({
        status: 'all',
        sort: 'created',
        limit: pageSize,
        offset
      });
      for (const novel of page.items) {
        const detail = await this.library.getNovel(novel.id);
        if (detail) documents.push(...novelProjectionDocuments(detail));
      }
      if (page.items.length === 0 || offset + page.items.length >= page.total) break;
      offset += page.items.length;
    }

    return documents;
  }
}
