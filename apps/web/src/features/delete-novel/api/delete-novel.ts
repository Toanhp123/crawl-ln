import { httpVoid } from '../../../shared/api';

export async function deleteNovel(novelId: string): Promise<string> {
  await httpVoid(`/api/novels/${encodeURIComponent(novelId)}`, { method: 'DELETE' });
  return novelId;
}
