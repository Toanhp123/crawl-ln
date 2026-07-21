import type { Chapter as ChapterTransport } from '@novel-tool/shared';
import { http } from '../../../shared/api';

export type Chapter = ChapterTransport;

export function getChapter(novelId: string, index: number, signal?: AbortSignal) {
  return http<Chapter>(`/api/novels/${encodeURIComponent(novelId)}/chapters/${index}`, { signal });
}
