import type { SearchLibrarySourcePort } from '../ports/search-library-source.port.js';
import type { SearchRepository } from '../ports/search.repository.js';

export class RebuildSearchIndexCommandHandler {
  constructor(
    private readonly source: SearchLibrarySourcePort,
    private readonly repository: SearchRepository
  ) {}

  async execute(): Promise<{ indexedDocuments: number }> {
    const documents = await this.source.listDocuments();
    return { indexedDocuments: await this.repository.replaceAll(documents) };
  }
}
