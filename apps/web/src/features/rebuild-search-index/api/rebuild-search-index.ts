import { http } from '../../../shared/api';

export interface RebuildSearchIndexResult {
  indexedDocuments: number;
  rebuiltAt: string;
}

export function rebuildSearchIndex(): Promise<RebuildSearchIndexResult> {
  return http<RebuildSearchIndexResult>('/api/search/rebuild', { method: 'POST' });
}
