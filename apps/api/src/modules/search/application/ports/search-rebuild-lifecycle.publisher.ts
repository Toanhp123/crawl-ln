import type { SearchIndexRebuildResult } from '../../domain/search.models.js';

export interface SearchRebuildLifecyclePublisher {
  started(): Promise<void>;
  completed(result: SearchIndexRebuildResult): Promise<void>;
  failed(): Promise<void>;
}
