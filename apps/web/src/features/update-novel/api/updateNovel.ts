import type { UpdateNovelResult } from '@novel-tool/shared';
import { http } from '@/shared/api/http';

export function updateNovel(novelId: string) {
  return http<UpdateNovelResult>(`/api/novels/${encodeURIComponent(novelId)}/update`, {
    method: 'POST'
  });
}
