export type LibraryErrorCode =
  | 'LIBRARY_VALIDATION_ERROR'
  | 'LIBRARY_INVALID_TRANSITION'
  | 'LIBRARY_NOT_FOUND'
  | 'LIBRARY_CONFLICT';

export class LibraryError extends Error {
  readonly kind: 'validation' | 'not_found' | 'conflict';

  constructor(
    readonly code: LibraryErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'LibraryError';
    this.kind =
      code === 'LIBRARY_VALIDATION_ERROR'
        ? 'validation'
        : code === 'LIBRARY_NOT_FOUND'
          ? 'not_found'
          : 'conflict';
  }

  static validation(message: string, details?: unknown): LibraryError {
    return new LibraryError('LIBRARY_VALIDATION_ERROR', message, details);
  }

  static invalidTransition(from: string, to: string): LibraryError {
    return new LibraryError(
      'LIBRARY_INVALID_TRANSITION',
      `Cannot transition library novel from ${from} to ${to}`,
      { from, to }
    );
  }
}
