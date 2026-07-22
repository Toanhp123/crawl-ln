export class NovelDomainValidationError extends Error {
  readonly kind = 'validation' as const;
  constructor(
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'NovelDomainValidationError';
  }
}
