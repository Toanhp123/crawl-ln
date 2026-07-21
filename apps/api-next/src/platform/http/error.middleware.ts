import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { SourceReaderError } from '../../modules/source-reader/domain/errors/source-reader.error.js';
import type { SourceReaderErrorCode } from '../../modules/source-reader/domain/errors/source-reader.error.js';
import { redactStructuredValue } from '../../modules/source-reader/application/services/source-reader-structured-logger.js';
import { fail } from './api-response.js';

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

function applicationFailureResponse(error: ApplicationFailure): {
  status: number;
  code: Parameters<typeof fail>[2];
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

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    return fail(response, 400, 'VALIDATION_ERROR', 'Validation failed', error.issues);
  }

  if (isApplicationFailure(error)) {
    const mapped = applicationFailureResponse(error);
    return fail(response, mapped.status, mapped.code, error.message, error.details);
  }

  if (error instanceof SourceReaderError) {
    const statusByCode: Partial<Record<SourceReaderErrorCode, number>> = {
      SOURCE_NOT_SUPPORTED: 422,
      CAPABILITY_NOT_SUPPORTED: 422,
      PLUGIN_RESULT_INVALID: 422,
      PLUGIN_RUNTIME_INCOMPATIBLE: 422,
      PLUGIN_CAPABILITY_CONTRACT_UNSUPPORTED: 422,
      PLUGIN_EXTENSION_CONTRACT_UNSUPPORTED: 422,
      PLUGIN_EXTENSION_SCHEMA_INVALID: 422,
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
      UPSTREAM_CHALLENGE_DETECTED: 502,
      PLUGIN_UNAVAILABLE: 503,
      PLUGIN_DISABLED: 503,
      PLUGIN_QUARANTINED: 503,
      NETWORK_ROUTE_OFFLINE: 503,
      SECRET_VAULT_UNAVAILABLE: 503,
      SOURCE_READER_CANCELLED: 499
    };
    return fail(response, statusByCode[error.code] ?? 502, error.code, error.message, {
      retryable: error.retryable,
      ...(response.locals.sourceReaderRequestId
        ? { requestId: String(response.locals.sourceReaderRequestId) }
        : {}),
      ...(error.details ? { details: redactStructuredValue(error.details) } : {})
    });
  }

  return fail(response, 500, 'INTERNAL_ERROR', 'Internal server error');
};
