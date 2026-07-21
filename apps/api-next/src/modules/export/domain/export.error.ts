export class ExportNotFoundError extends Error {
  readonly kind = 'not_found' as const;

  constructor(
    message = 'Resource not found',
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ExportNotFoundError';
  }
}

export class ExportConflictError extends Error {
  readonly kind = 'conflict' as const;

  constructor(
    message = 'Conflict',
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ExportConflictError';
  }
}
