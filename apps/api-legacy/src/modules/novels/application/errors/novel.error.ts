export class NovelNotFoundError extends Error {
  readonly kind = 'not_found' as const;
  constructor(
    message = 'Novel not found',
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'NovelNotFoundError';
  }
}
export class NovelValidationError extends Error {
  readonly kind = 'validation' as const;
  constructor(
    message = 'Validation failed',
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'NovelValidationError';
  }
}
