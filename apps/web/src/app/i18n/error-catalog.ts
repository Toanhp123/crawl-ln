import { ApiError } from '@/shared/api';
import type { Language } from '@/shared/i18n';
import { appCatalogs } from './catalog';

const fallbackKey = 'common.requestFailed';
const errorKeys = {
  NOT_FOUND: 'errors.notFound',
  VALIDATION_ERROR: 'errors.validation',
  BAD_REQUEST: 'errors.validation',
  FORBIDDEN: 'errors.forbidden',
  CONFLICT: 'errors.conflict',
  INTERNAL_ERROR: 'errors.internal'
} as const;

function preferredLanguage(): Language {
  if (typeof localStorage === 'undefined') return 'vi';
  return localStorage.getItem('novel-tool-language') === 'en' ? 'en' : 'vi';
}

function errorKey(error: unknown): string {
  if (error instanceof ApiError)
    return errorKeys[error.code as keyof typeof errorKeys] ?? fallbackKey;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /network|failed to fetch|load failed|econn|enotfound|timeout/i.test(message)
    ? 'errors.network'
    : fallbackKey;
}

export function interpretAppError(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    const message = error.message.trim();
    if (message) return message;
  }

  const catalog = appCatalogs[preferredLanguage()];
  const message = catalog[errorKey(error)] ?? catalog[fallbackKey];
  return message || undefined;
}
