import type { SearchDocument } from '../../domain/search.models.js';

export interface SearchLibrarySourcePort {
  listDocuments(): Promise<SearchDocument[]>;
}
