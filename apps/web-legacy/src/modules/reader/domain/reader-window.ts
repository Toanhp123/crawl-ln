import type { Chapter } from '@novel-tool/shared';

export interface ReaderWindow {
  chapters: Chapter[];
}

export function createReaderWindow(initial: Chapter, _activeIndex: number): ReaderWindow {
  return { chapters: [initial] };
}

function trimAroundActive(chapters: Chapter[], activeIndex: number, limit: number): Chapter[] {
  if (chapters.length <= limit) return chapters;
  const activePosition = chapters.findIndex((item) => item.index === activeIndex);
  if (activePosition < 0) return chapters.slice(-limit);

  const before = Math.floor((limit - 1) / 2);
  const maxStart = chapters.length - limit;
  const start = Math.min(Math.max(0, activePosition - before), maxStart);
  return chapters.slice(start, start + limit);
}

function insert(
  window: ReaderWindow,
  chapter: Chapter,
  activeIndex: number,
  limit: number
): ReaderWindow {
  if (window.chapters.some((item) => item.id === chapter.id)) return window;
  const chapters = [...window.chapters, chapter].sort((a, b) => a.index - b.index);
  return { chapters: trimAroundActive(chapters, activeIndex, limit) };
}

export function appendReaderChapter(
  window: ReaderWindow,
  chapter: Chapter,
  activeIndex: number,
  limit = 5
): ReaderWindow {
  return insert(window, chapter, activeIndex, limit);
}

export function prependReaderChapter(
  window: ReaderWindow,
  chapter: Chapter,
  activeIndex: number,
  limit = 5
): ReaderWindow {
  return insert(window, chapter, activeIndex, limit);
}
