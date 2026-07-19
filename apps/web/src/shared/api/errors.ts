import type { ApiErrorCode, ApiFailure } from '@novel-tool/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown | null;

  constructor(
    message: string,
    options: { status: number; code: ApiErrorCode; details?: unknown | null }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? null;
  }
}

export function getErrorMessage(error: unknown, fallback = ''): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function isApiFailure(value: unknown): value is ApiFailure {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ApiFailure>;
  return (
    candidate.data === null &&
    typeof candidate.error === 'object' &&
    candidate.error !== null &&
    typeof candidate.error.code === 'string' &&
    typeof candidate.error.message === 'string'
  );
}

export async function readApiError(response: Response): Promise<ApiError> {
  const fallback = `Request failed: ${response.status}`;
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload: unknown = await response.json().catch(() => null);
    if (isApiFailure(payload)) {
      return new ApiError(payload.error.message, {
        status: response.status,
        code: payload.error.code,
        details: payload.error.details
      });
    }
  }

  const text = await response.text().catch(() => '');
  return new ApiError(text || fallback, {
    status: response.status,
    code: 'INTERNAL_ERROR'
  });
}
