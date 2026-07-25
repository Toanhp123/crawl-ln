export class SearchIndexRebuildConflictError extends Error {
  readonly kind = 'conflict' as const;

  constructor(message = 'Search index rebuild is already running') {
    super(message);
    this.name = 'SearchIndexRebuildConflictError';
  }
}
