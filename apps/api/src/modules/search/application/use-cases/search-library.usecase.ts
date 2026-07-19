import type { SearchRepository } from '../ports/search.repository.js';
import type { SearchQuery } from '../../domain/search.js';
export class SearchLibraryUseCase {
  constructor(private readonly repository: SearchRepository) {}
  execute(query: SearchQuery) {
    return this.repository.search(query);
  }
}
export class RebuildSearchIndexUseCase {
  constructor(private readonly repository: SearchRepository) {}
  async execute() {
    return { indexedDocuments: await this.repository.rebuild() };
  }
}
