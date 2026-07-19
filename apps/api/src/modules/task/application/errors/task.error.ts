export class TaskNotFoundError extends Error {
  readonly kind = 'not_found' as const;
  constructor(
    message = 'Task not found',
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'TaskNotFoundError';
  }
}
export class TaskConflictError extends Error {
  readonly kind = 'conflict' as const;
  constructor(
    message = 'Conflict',
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'TaskConflictError';
  }
}
