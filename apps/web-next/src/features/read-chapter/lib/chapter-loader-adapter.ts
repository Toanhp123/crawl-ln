import type { ReaderChapterLoader } from '@novel-tool/reader-engine';
import { getChapter, type Chapter } from '../../../entities/chapter';

export type ChapterReadPort = (
  novelId: string,
  index: number,
  signal?: AbortSignal
) => Promise<Chapter>;

export function createChapterLoaderAdapter(
  readChapter: ChapterReadPort = getChapter
): ReaderChapterLoader<Chapter> {
  return {
    async load(novelId, index, signal) {
      const chapter = await readChapter(novelId, index, signal);
      return {
        ...chapter,
        id: chapter.id,
        index: chapter.index,
        contentVersion: chapter.contentVersion
      };
    }
  };
}

export const chapterLoaderAdapter = createChapterLoaderAdapter();
