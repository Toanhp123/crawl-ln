export type ApiErrorCode = string;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown | null;
  readonly requestId?: string;

  constructor(
    message: string,
    options: {
      status: number;
      code: ApiErrorCode;
      details?: unknown | null;
      requestId?: string;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? null;
    this.requestId = options.requestId;
  }
}

export function getPublicErrorDescription(error: unknown): string {
  if (!(error instanceof ApiError)) return 'REQUEST_FAILED';
  const code = error.code || 'REQUEST_FAILED';
  return error.requestId ? `${code} · Request ID: ${error.requestId}` : code;
}

export function getErrorMessage(error: unknown, fallback = ''): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

type FailureEnvelope = {
  data: null;
  error: { code: string; message: string; details: unknown | null };
};

function isFailureEnvelope(value: unknown): value is FailureEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<FailureEnvelope>;
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
    if (isFailureEnvelope(payload)) {
      return new ApiError(payload.error.message, {
        status: response.status,
        code: payload.error.code,
        details: payload.error.details,
        requestId: response.headers.get('x-request-id') ?? undefined
      });
    }
  }

  const text = await response.text().catch(() => '');
  return new ApiError(text || fallback, {
    status: response.status,
    code: 'INTERNAL_ERROR',
    requestId: response.headers.get('x-request-id') ?? undefined
  });
}
