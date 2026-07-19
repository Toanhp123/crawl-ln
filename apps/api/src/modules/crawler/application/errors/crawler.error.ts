abstract class CrawlerError extends Error {
  abstract readonly kind: 'bad_request' | 'forbidden' | 'not_found' | 'conflict';
  constructor(
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}
export class CrawlerBadRequestError extends CrawlerError {
  readonly kind = 'bad_request' as const;
  constructor(message = 'Bad request', details?: unknown) {
    super(message, details);
    this.name = 'CrawlerBadRequestError';
  }
}
export class CrawlerForbiddenError extends CrawlerError {
  readonly kind = 'forbidden' as const;
  constructor(message = 'Forbidden', details?: unknown) {
    super(message, details);
    this.name = 'CrawlerForbiddenError';
  }
}
export class CrawlerNotFoundError extends CrawlerError {
  readonly kind = 'not_found' as const;
  constructor(message = 'Resource not found', details?: unknown) {
    super(message, details);
    this.name = 'CrawlerNotFoundError';
  }
}
export class CrawlerConflictError extends CrawlerError {
  readonly kind = 'conflict' as const;
  constructor(message = 'Conflict', details?: unknown) {
    super(message, details);
    this.name = 'CrawlerConflictError';
  }
}
