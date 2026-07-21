export type LibraryErrorCode =
  | 'LIBRARY_VALIDATION_ERROR'
  | 'LIBRARY_INVALID_TRANSITION'
  | 'LIBRARY_NOT_FOUND'
  | 'LIBRARY_CONFLICT';

export class LibraryError extends Error {
  constructor(
    readonly code: LibraryErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'LibraryError';
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
