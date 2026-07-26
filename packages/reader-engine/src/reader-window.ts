import type { ReaderChapterIdentity } from './contracts.js';

export interface ReaderWindow<TChapter extends ReaderChapterIdentity> {
  chapters: readonly TChapter[];
}

function insert<TChapter extends ReaderChapterIdentity>(
  chapterWindow: ReaderWindow<TChapter>,
  chapter: TChapter
): ReaderWindow<TChapter> {
  const existing = chapterWindow.chapters.find((item) => item.id === chapter.id);
  if (existing?.contentVersion === chapter.contentVersion) return chapterWindow;

  const chapters = [
    ...chapterWindow.chapters.filter((item) => item.id !== chapter.id),
    chapter
  ].sort((left, right) => left.index - right.index);
  return { chapters };
}

export function createReaderWindow<TChapter extends ReaderChapterIdentity>(
  initial: TChapter
): ReaderWindow<TChapter> {
  return { chapters: [initial] };
}

export function appendReaderChapter<TChapter extends ReaderChapterIdentity>(
  chapterWindow: ReaderWindow<TChapter>,
  chapter: TChapter
): ReaderWindow<TChapter> {
  return insert(chapterWindow, chapter);
}

export function prependReaderChapter<TChapter extends ReaderChapterIdentity>(
  chapterWindow: ReaderWindow<TChapter>,
  chapter: TChapter
): ReaderWindow<TChapter> {
  return insert(chapterWindow, chapter);
}
