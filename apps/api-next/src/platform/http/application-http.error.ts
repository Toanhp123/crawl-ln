export class ApplicationHttpError extends Error {
  constructor(
    readonly kind: 'bad_request' | 'forbidden' | 'not_found' | 'conflict',
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApplicationHttpError';
  }
}
