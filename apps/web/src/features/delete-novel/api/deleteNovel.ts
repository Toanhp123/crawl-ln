import { httpVoid } from '@/shared/api/http';

export async function deleteNovel(novelId: string) {
  await httpVoid(`/api/novels/${encodeURIComponent(novelId)}`, { method: 'DELETE' });
  return true;
}
