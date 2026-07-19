import { useEffect, useState } from 'react';
import type { StoredReadingPositionV3 } from './readingPositionStorage';
export interface ReadingHistoryEntry extends StoredReadingPositionV3 {
  lastOpenedAt: string;
}
export interface ParagraphBookmark {
  id: string;
  novelId: string;
  chapterId: string;
  chapterIndex: number;
  paragraphId: string;
  paragraphOffset: number;
  createdAt: string;
}
const HISTORY_KEY = 'novel-tool-reading-history:v2',
  BOOKMARKS_KEY = 'novel-tool-bookmarks:v2',
  READ_KEY_PREFIX = 'novel-tool-read-chapters:v2:',
  CHANGE_EVENT = 'novel-tool-reading-continuity-change',
  MAX_HISTORY = 50;
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {}
}
export function recordReadingActivity(position: StoredReadingPositionV3) {
  const history = readJson<ReadingHistoryEntry[]>(HISTORY_KEY, []);
  const entry = { ...position, lastOpenedAt: new Date().toISOString() };
  writeJson(
    HISTORY_KEY,
    [entry, ...history.filter((x) => x.novelId !== position.novelId)].slice(0, MAX_HISTORY)
  );
  markChapterRead(position.novelId, position.chapterId, false);
}
export function listReadingHistory() {
  return readJson<ReadingHistoryEntry[]>(HISTORY_KEY, []).filter(
    (x) => x && typeof x.novelId === 'string' && typeof x.chapterId === 'string'
  );
}
export function listBookmarks(novelId?: string) {
  return readJson<ParagraphBookmark[]>(BOOKMARKS_KEY, []).filter(
    (x) => x && typeof x.id === 'string' && (!novelId || x.novelId === novelId)
  );
}
export function isBookmarked(novelId: string, chapterId: string, paragraphId: string) {
  return (
    !!paragraphId &&
    listBookmarks(novelId).some((x) => x.chapterId === chapterId && x.paragraphId === paragraphId)
  );
}
export function toggleBookmark(
  position: Pick<
    StoredReadingPositionV3,
    'novelId' | 'chapterId' | 'chapterIndex' | 'paragraphId' | 'paragraphOffset'
  >
) {
  if (!position.paragraphId) return false;
  const all = listBookmarks();
  const existing = all.find(
    (x) =>
      x.novelId === position.novelId &&
      x.chapterId === position.chapterId &&
      x.paragraphId === position.paragraphId
  );
  if (existing) {
    writeJson(
      BOOKMARKS_KEY,
      all.filter((x) => x.id !== existing.id)
    );
    return false;
  }
  const bookmark = {
    id: `${position.novelId}:${position.chapterId}:${position.paragraphId}`,
    ...position,
    createdAt: new Date().toISOString()
  };
  writeJson(BOOKMARKS_KEY, [bookmark, ...all].slice(0, 200));
  return true;
}
export function removeBookmark(id: string) {
  writeJson(
    BOOKMARKS_KEY,
    listBookmarks().filter((x) => x.id !== id)
  );
}
export function readChapterIds(novelId: string): Set<string> {
  return new Set(
    readJson<string[]>(`${READ_KEY_PREFIX}${novelId}`, []).filter((x) => typeof x === 'string')
  );
}
export function markChapterRead(novelId: string, chapterId: string, notify = true) {
  const ids = readChapterIds(novelId);
  if (ids.has(chapterId)) return;
  ids.add(chapterId);
  try {
    localStorage.setItem(`${READ_KEY_PREFIX}${novelId}`, JSON.stringify([...ids].sort()));
    if (notify) window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {}
}
export function useReadingContinuityVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion((v) => v + 1);
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return version;
}
