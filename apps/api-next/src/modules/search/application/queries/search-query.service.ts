import type { SearchQuery, SearchResultPage } from '../../domain/search.models.js';
import type { SearchRepository } from '../ports/search.repository.js';

export class SearchQueryService {
  constructor(private readonly repository: SearchRepository) {}

  execute(query: SearchQuery): Promise<SearchResultPage> {
    return this.repository.search(query);
  }
}
