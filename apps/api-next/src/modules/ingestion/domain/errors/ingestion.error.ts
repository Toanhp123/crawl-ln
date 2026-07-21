export type IngestionErrorCode =
  | 'INGESTION_VALIDATION_ERROR'
  | 'INGESTION_INVALID_TRANSITION'
  | 'INGESTION_ACTIVE_JOB_CONFLICT'
  | 'INGESTION_SOURCE_POLICY_DENIED'
  | 'INGESTION_NOT_FOUND'
  | 'INGESTION_CONFLICT';

export class IngestionError extends Error {
  readonly kind: 'bad_request' | 'forbidden' | 'not_found' | 'conflict';

  constructor(
    readonly code: IngestionErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'IngestionError';
    this.kind =
      code === 'INGESTION_VALIDATION_ERROR'
        ? 'bad_request'
        : code === 'INGESTION_SOURCE_POLICY_DENIED'
          ? 'forbidden'
          : code === 'INGESTION_NOT_FOUND'
            ? 'not_found'
            : 'conflict';
  }

  static validation(message: string, details?: unknown): IngestionError {
    return new IngestionError('INGESTION_VALIDATION_ERROR', message, details);
  }

  static invalidTransition(status: string, action: string): IngestionError {
    return new IngestionError(
      'INGESTION_INVALID_TRANSITION',
      `Cannot ${action} a ${status} ingestion job`,
      { status, action }
    );
  }
}
