import type { ApiErrorCode } from '@novel-tool/shared';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../shared/logger/logger.js';
import { SourceReaderError } from '../../modules/source-reader/domain/errors/source-reader.error.js';
import { fail } from '../../shared/http/api-response.js';

type ApplicationFailureKind = 'validation' | 'bad_request' | 'forbidden' | 'not_found' | 'conflict';

type ApplicationFailure = Error & {
  readonly kind: ApplicationFailureKind;
  readonly details?: unknown;
};

function isApplicationFailure(error: unknown): error is ApplicationFailure {
  if (!(error instanceof Error) || !('kind' in error)) return false;
  return ['validation', 'bad_request', 'forbidden', 'not_found', 'conflict'].includes(
    String(error.kind)
  );
}

function mapApplicationFailure(error: ApplicationFailure): {
  status: number;
  code: ApiErrorCode;
} {
  switch (error.kind) {
    case 'validation':
      return { status: 400, code: 'VALIDATION_ERROR' };
    case 'bad_request':
      return { status: 400, code: 'BAD_REQUEST' };
    case 'forbidden':
      return { status: 403, code: 'FORBIDDEN' };
    case 'not_found':
      return { status: 404, code: 'NOT_FOUND' };
    case 'conflict':
      return { status: 409, code: 'CONFLICT' };
  }
}

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Validation failed', error.issues);
  }

  if (isApplicationFailure(error)) {
    const mapped = mapApplicationFailure(error);
    return fail(res, mapped.status, mapped.code, error.message, error.details);
  }

  if (error instanceof SourceReaderError) {
    const status =
      error.code === 'SOURCE_NOT_SUPPORTED' || error.code === 'CAPABILITY_NOT_SUPPORTED'
        ? 422
        : error.code === 'SOURCE_READER_CANCELLED'
          ? 499
          : 502;
    return fail(res, status, error.code, error.message, error.details);
  }

  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  return fail(res, 500, 'INTERNAL_ERROR', 'Internal server error');
};
