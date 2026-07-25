import type {
  SearchDocument,
  SearchIndexMetadata,
  SearchIndexRebuildResult,
  SearchQuery,
  SearchResultPage
} from '../../domain/search.models.js';

export interface SearchProjectionEvent {
  id: string;
  type: string;
  projectedAt: string;
}

export interface SearchRepository {
  search(query: SearchQuery): Promise<SearchResultPage>;
  countDocuments(): Promise<number>;
  getIndexMetadata(): Promise<SearchIndexMetadata | null>;
  replaceAllForRebuild(
    documents: SearchDocument[],
    rebuiltAt: string
  ): Promise<SearchIndexRebuildResult>;
  replaceNovelForEvent(
    event: SearchProjectionEvent,
    novelId: string,
    documents: SearchDocument[]
  ): Promise<boolean>;
  replaceChapterForEvent(event: SearchProjectionEvent, document: SearchDocument): Promise<boolean>;
  deleteNovelForEvent(event: SearchProjectionEvent, novelId: string): Promise<boolean>;
}
