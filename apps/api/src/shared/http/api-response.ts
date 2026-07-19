import type { Response } from 'express';
import type { ApiErrorCode } from '@novel-tool/shared';

export type ApiSuccess<T> = { data: T; error: null };
export type ApiFailure = {
  data: null;
  error: { code: ApiErrorCode; message: string; details: unknown | null };
};

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data, error: null } satisfies ApiSuccess<T>);
}
export function created<T>(res: Response, data: T) {
  return ok(res, data, 201);
}
export function accepted<T>(res: Response, data: T) {
  return ok(res, data, 202);
}
export function noContent(res: Response) {
  return res.status(204).send();
}
export function fail(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
) {
  return res
    .status(status)
    .json({ data: null, error: { code, message, details: details ?? null } } satisfies ApiFailure);
}
