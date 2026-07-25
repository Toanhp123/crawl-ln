import type { SearchIndexStatus } from '../../../entities/search';

export type SearchIndexDisplayState = {
  key: 'ready' | 'rebuilding';
  tone: 'success' | 'info';
};

export function getSearchIndexDisplayState(
  status: Pick<SearchIndexStatus, 'rebuildRunning'>
): SearchIndexDisplayState {
  return status.rebuildRunning
    ? { key: 'rebuilding', tone: 'info' }
    : { key: 'ready', tone: 'success' };
}
