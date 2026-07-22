import type { ReaderChapterIdentity } from './contracts.js';

export interface ReaderWindow<TChapter extends ReaderChapterIdentity> {
  chapters: readonly TChapter[];
}

function trimAroundActive<TChapter extends ReaderChapterIdentity>(
  chapters: readonly TChapter[],
  activeIndex: number,
  limit: number
): readonly TChapter[] {
  if (chapters.length <= limit) return chapters;
  const activePosition = chapters.findIndex((item) => item.index === activeIndex);
  if (activePosition < 0) return chapters.slice(-limit);

  const before = Math.floor((limit - 1) / 2);
  const maxStart = chapters.length - limit;
  const start = Math.min(Math.max(0, activePosition - before), maxStart);
  return chapters.slice(start, start + limit);
}

function insert<TChapter extends ReaderChapterIdentity>(
  chapterWindow: ReaderWindow<TChapter>,
  chapter: TChapter,
  activeIndex: number,
  limit: number
): ReaderWindow<TChapter> {
  const existing = chapterWindow.chapters.find((item) => item.id === chapter.id);
  if (existing?.contentVersion === chapter.contentVersion) return chapterWindow;

  const chapters = [
    ...chapterWindow.chapters.filter((item) => item.id !== chapter.id),
    chapter
  ].sort((left, right) => left.index - right.index);
  return { chapters: trimAroundActive(chapters, activeIndex, limit) };
}

export function createReaderWindow<TChapter extends ReaderChapterIdentity>(
  initial: TChapter,
  activeIndex: number,
  limit = 5
): ReaderWindow<TChapter> {
  return { chapters: trimAroundActive([initial], activeIndex, limit) };
}

export function appendReaderChapter<TChapter extends ReaderChapterIdentity>(
  chapterWindow: ReaderWindow<TChapter>,
  chapter: TChapter,
  activeIndex: number,
  limit = 5
): ReaderWindow<TChapter> {
  return insert(chapterWindow, chapter, activeIndex, limit);
}

export function prependReaderChapter<TChapter extends ReaderChapterIdentity>(
  chapterWindow: ReaderWindow<TChapter>,
  chapter: TChapter,
  activeIndex: number,
  limit = 5
): ReaderWindow<TChapter> {
  return insert(chapterWindow, chapter, activeIndex, limit);
}

export function focusReaderWindow<TChapter extends ReaderChapterIdentity>(
  chapterWindow: ReaderWindow<TChapter>,
  activeIndex: number,
  limit = 5
): ReaderWindow<TChapter> {
  return { chapters: trimAroundActive(chapterWindow.chapters, activeIndex, limit) };
}
