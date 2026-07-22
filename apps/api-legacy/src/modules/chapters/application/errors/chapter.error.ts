export class ChapterNotFoundError extends Error {
  readonly kind = 'not_found' as const;
  constructor(
    message = 'Chapter not found',
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ChapterNotFoundError';
  }
}
