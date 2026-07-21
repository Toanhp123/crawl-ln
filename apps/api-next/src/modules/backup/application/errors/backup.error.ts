export class BackupBadRequestError extends Error {
  readonly kind = 'bad_request' as const;

  constructor(
    message = 'Bad request',
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'BackupBadRequestError';
  }
}
