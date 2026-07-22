import type { ApiResponse, ApiSuccess } from '@novel-tool/shared';
import { API_BASE_URL } from '../config/api';
import { ApiError, readApiError } from './errors';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  return isObject(value) && 'data' in value && value.error === null;
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
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
  if (!isApiResponse<T>(payload)) {
    throw new ApiError('The API returned an invalid response envelope', {
      status: response.status,
      code: 'INTERNAL_ERROR',
      details: payload
    });
  }
  if (!isApiSuccess(payload)) {
    throw new ApiError(payload.error.message, {
      status: response.status,
      code: payload.error.code,
      details: payload.error.details
    });
  }
  return payload.data;
}

function createRequest(path: string, init?: RequestInit) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
}

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  return readApiSuccess<T>(await createRequest(path, init));
}

export async function httpVoid(path: string, init?: RequestInit): Promise<void> {
  const response = await createRequest(path, init);
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
