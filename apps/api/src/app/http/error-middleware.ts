import type { ApiErrorCode } from '@novel-tool/shared';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../shared/logger/logger.js';
import { SourceReaderError } from '../../modules/source-reader/domain/errors/source-reader.error.js';
import type { SourceReaderErrorCode } from '../../modules/source-reader/domain/errors/source-reader.error.js';
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
    const sourceReaderStatus: Partial<Record<SourceReaderErrorCode, number>> = {
      SOURCE_NOT_SUPPORTED: 422,
      CAPABILITY_NOT_SUPPORTED: 422,
      PLUGIN_RESULT_INVALID: 422,
      PLUGIN_PACKAGE_INVALID: 422,
      CURSOR_INVALID: 400,
      CURSOR_INVALIDATED: 409,
      AUTHENTICATION_REQUIRED: 401,
      AUTHENTICATION_FAILED: 401,
      CREDENTIAL_NOT_CONFIGURED: 401,
      CREDENTIAL_UNAVAILABLE: 404,
      PLUGIN_PERMISSION_DENIED: 403,
      PLUGIN_NETWORK_PERMISSION_DENIED: 403,
      NETWORK_ACCESS_BLOCKED: 403,
      AUTH_CHALLENGE_REQUIRED: 409,
      AUTH_CHALLENGE_EXPIRED: 409,
      SOURCE_RATE_LIMITED: 429,
      SOURCE_REQUEST_TIMEOUT: 504,
      SOURCE_TEMPORARILY_UNAVAILABLE: 502,
      PLUGIN_UNAVAILABLE: 503,
      PLUGIN_DISABLED: 503,
      PLUGIN_QUARANTINED: 503,
      NETWORK_ROUTE_OFFLINE: 503,
      SECRET_VAULT_UNAVAILABLE: 503,
      SOURCE_READER_CANCELLED: 499
    };
    return fail(res, sourceReaderStatus[error.code] ?? 502, error.code, error.message, {
      retryable: error.retryable,
      ...(res.locals.sourceReaderRequestId
        ? { requestId: String(res.locals.sourceReaderRequestId) }
        : {}),
      ...(error.details ? { details: error.details } : {})
    });
  }

  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  return fail(res, 500, 'INTERNAL_ERROR', 'Internal server error');
};
