export class SchedulerNotFoundError extends Error {
  readonly kind = 'not_found' as const;
  constructor(
    message = 'Resource not found',
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'SchedulerNotFoundError';
  }
}
