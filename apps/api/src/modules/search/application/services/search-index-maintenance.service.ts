import { SearchIndexRebuildConflictError } from '../../domain/search.error.js';
import type { SearchIndexRebuildResult, SearchIndexStatus } from '../../domain/search.models.js';
import type { SearchLibrarySourcePort } from '../ports/search-library-source.port.js';
import type { SearchRebuildLifecyclePublisher } from '../ports/search-rebuild-lifecycle.publisher.js';
import type { SearchRepository } from '../ports/search.repository.js';

export class SearchIndexMaintenanceService {
  private rebuildRunning = false;

  constructor(
    private readonly source: SearchLibrarySourcePort,
    private readonly repository: SearchRepository,
    private readonly lifecycle: SearchRebuildLifecyclePublisher,
    private readonly clock: { now(): Date }
  ) {}

  async getStatus(): Promise<SearchIndexStatus> {
    const [indexedDocuments, metadata] = await Promise.all([
      this.repository.countDocuments(),
      this.repository.getIndexMetadata()
    ]);

    return {
      rebuildRunning: this.rebuildRunning,
      indexedDocuments,
      lastRebuiltAt: metadata?.lastRebuiltAt ?? null,
      lastIndexedDocuments: metadata?.lastIndexedDocuments ?? null
    };
  }

  async rebuild(): Promise<SearchIndexRebuildResult> {
    if (this.rebuildRunning) throw new SearchIndexRebuildConflictError();
    this.rebuildRunning = true;

    try {
      await this.lifecycle.started();
    } catch (error) {
      this.rebuildRunning = false;
      throw error;
    }

    let result: SearchIndexRebuildResult;
    try {
      const documents = await this.source.listDocuments();
      result = await this.repository.replaceAllForRebuild(
        documents,
        this.clock.now().toISOString()
      );
    } catch (error) {
      this.rebuildRunning = false;
      await this.lifecycle.failed();
      throw error;
    }

    this.rebuildRunning = false;
    await this.lifecycle.completed(result);
    return result;
  }
}
