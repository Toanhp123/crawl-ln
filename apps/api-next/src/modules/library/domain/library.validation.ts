import { LibraryError } from './errors/library.error.js';

export function assertNonBlank(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw LibraryError.validation(`${field} must not be blank`, { field });
  }
}

export function assertHttpUrl(value: string, field: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid protocol');
  } catch {
    throw LibraryError.validation(`${field} must be an HTTP(S) URL`, { field, value });
  }
}

export function assertTimestamp(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw LibraryError.validation(`${field} must be a valid timestamp`, { field, value });
  }
}
