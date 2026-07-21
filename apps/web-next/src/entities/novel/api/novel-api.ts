import type { NovelDetail, NovelStats, PaginatedNovels } from '@novel-tool/shared';
import { http } from '../../../shared/api';

export type ListNovelsOptions = {
  q?: string;
  status?: 'all' | 'completed' | 'active' | 'analyzed' | 'crawling' | 'failed' | 'importing';
  sort?: 'recent' | 'created' | 'title' | 'chapters';
  limit?: number;
  offset?: number;
  ids?: string[];
  excludeIds?: string[];
  readingOrder?: string[];
};

export function listNovels(options: ListNovelsOptions = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (options.q) params.set('q', options.q);
  if (options.status) params.set('status', options.status);
  if (options.sort) params.set('sort', options.sort);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  if (options.ids?.length) params.set('ids', options.ids.join(','));
  if (options.excludeIds?.length) params.set('excludeIds', options.excludeIds.join(','));
  if (options.readingOrder?.length) params.set('readingOrder', options.readingOrder.join(','));
  const query = params.toString();
  return http<PaginatedNovels>(`/api/novels${query ? `?${query}` : ''}`, { signal });
}

export function getNovel(novelId: string, signal?: AbortSignal) {
  return http<NovelDetail>(`/api/novels/${encodeURIComponent(novelId)}`, { signal });
}

export function getNovelStats(signal?: AbortSignal) {
  return http<NovelStats>('/api/novels/stats', { signal });
}
