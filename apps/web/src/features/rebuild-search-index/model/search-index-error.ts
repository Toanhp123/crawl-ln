import { ApiError } from '../../../shared/api';

export function isSearchIndexRebuildConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === 'CONFLICT';
}
