import type { ApiErrorCode, ApiFailure, ApiSuccess } from '@novel-tool/shared';
import type { Response } from 'express';

export function ok<T>(response: Response, data: T, status = 200) {
  return response.status(status).json({ data, error: null } satisfies ApiSuccess<T>);
}

export function created<T>(response: Response, data: T) {
  return ok(response, data, 201);
}

export function accepted<T>(response: Response, data: T) {
  return ok(response, data, 202);
}

export function noContent(response: Response) {
  return response.status(204).send();
}

export function fail(
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
) {
  return response.status(status).json({
    data: null,
    error: { code, message, details: details ?? null }
  } satisfies ApiFailure);
}
