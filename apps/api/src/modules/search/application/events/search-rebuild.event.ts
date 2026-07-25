import type { SearchIndexRebuildResult } from '../../domain/search.models.js';

export const SEARCH_REBUILD_STARTED = 'search.rebuild.started';
export const SEARCH_REBUILD_COMPLETED = 'search.rebuild.completed';
export const SEARCH_REBUILD_FAILED = 'search.rebuild.failed';

export type SearchRebuildCompletedPayload = SearchIndexRebuildResult;
