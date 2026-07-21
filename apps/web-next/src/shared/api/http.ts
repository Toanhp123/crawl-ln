import { API_BASE_URL } from '../config/api';
import { ApiError, readApiError } from './errors';

type SuccessEnvelope<T> = { data: T; error: null };
type FailureEnvelope = {
  data: null;
  error: { code: string; message: string; details: unknown | null };
};
type ResponseEnvelope<T> = SuccessEnvelope<T> | FailureEnvelope;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isResponseEnvelope<T>(value: unknown): value is ResponseEnvelope<T> {
  if (!isObject(value) || !('data' in value) || !('error' in value)) return false;
  if (value.error === null) return true;
  return (
    isObject(value.error) &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string' &&
    'details' in value.error
  );
}

export async function readApiSuccess<T>(response: Response): Promise<T> {
  if (!response.ok) throw await readApiError(response);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiError('Expected a JSON response from the API', {
      status: response.status,
      code: 'INTERNAL_ERROR'
    });
  }

  const payload: unknown = await response.json();
  if (!isResponseEnvelope<T>(payload)) {
    throw new ApiError('The API returned an invalid response envelope', {
      status: response.status,
      code: 'INTERNAL_ERROR',
      details: payload
    });
  }
  if (payload.error !== null) {
    throw new ApiError(payload.error.message, {
      status: response.status,
      code: payload.error.code,
      details: payload.error.details
    });
  }
  return payload.data;
}

function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
}

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  return readApiSuccess<T>(await request(path, init));
}

export async function httpVoid(path: string, init?: RequestInit): Promise<void> {
  const response = await request(path, init);
  if (!response.ok) throw await readApiError(response);
  if (response.status !== 204) {
    throw new ApiError(`Expected HTTP 204 but received ${response.status}`, {
      status: response.status,
      code: 'INTERNAL_ERROR'
    });
  }
}

export async function httpFormData<T>(
  path: string,
  body: FormData,
  init?: Omit<RequestInit, 'body'>
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method: init?.method ?? 'POST',
    body
  });
  return readApiSuccess<T>(response);
}
