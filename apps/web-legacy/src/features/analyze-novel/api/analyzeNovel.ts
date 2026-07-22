import type { Chapter, Novel } from '@novel-tool/shared';
import type { NovelDetail } from '@/entities/novel/model/types';
import { http } from '@/shared/api/http';

type AnalyzeResponse = Novel & { chapters: Chapter[] };

export async function analyzeNovel(url: string): Promise<NovelDetail> {
  const data = await http<AnalyzeResponse>('/api/novels/analyze', {
    method: 'POST',
    body: JSON.stringify({ url })
  });
  const { chapters, ...novel } = data;
  return { novel, chapters };
}
