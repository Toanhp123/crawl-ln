import type { Novel, NovelDetail } from '../../../entities/novel';
import { http } from '../../../shared/api';

type AnalyzeNovelResponse = Novel & { chapters: NovelDetail['chapters'] };

export async function analyzeNovel(url: string): Promise<NovelDetail> {
  const data = await http<AnalyzeNovelResponse>('/api/novels/analyze', {
    method: 'POST',
    body: JSON.stringify({ url })
  });
  const { chapters, ...novel } = data;
  return { novel, chapters };
}
