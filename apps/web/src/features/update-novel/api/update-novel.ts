import type { UpdateNovelResult } from '@novel-tool/shared';
import { http } from '../../../shared/api';

export function updateNovel(novelId: string): Promise<UpdateNovelResult> {
  return http<UpdateNovelResult>(`/api/novels/${encodeURIComponent(novelId)}/update`, {
    method: 'POST'
  });
}
