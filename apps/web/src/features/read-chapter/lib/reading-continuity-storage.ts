import { useEffect, useState } from 'react';
import type { StoredReadingPosition } from './reading-position-storage';

export interface ReadingHistoryEntry extends StoredReadingPosition {
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

const HISTORY_KEY = 'novel-tool-reader-history';
const BOOKMARKS_KEY = 'novel-tool-reader-bookmarks';
const READ_KEY_PREFIX = 'novel-tool-reader-read:';
const CHANGE_EVENT = 'novel-tool-reading-continuity-change';
const MAX_HISTORY = 50;

function getStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = getStorage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function notifyChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

function writeJson(key: string, value: unknown): void {
  try {
    getStorage()?.setItem(key, JSON.stringify(value));
    notifyChange();
  } catch {
    // Reading continuity is best-effort and must not block the reader.
  }
}

export function recordReadingActivity(position: StoredReadingPosition): void {
  const history = readJson<ReadingHistoryEntry[]>(HISTORY_KEY, []);
  const entry = { ...position, lastOpenedAt: new Date().toISOString() };
  writeJson(
    HISTORY_KEY,
    [entry, ...history.filter((item) => item.novelId !== position.novelId)].slice(0, MAX_HISTORY)
  );
  markChapterRead(position.novelId, position.chapterId, false);
}

export function listReadingHistory(): ReadingHistoryEntry[] {
  return readJson<ReadingHistoryEntry[]>(HISTORY_KEY, []).filter(
    (item) => item && typeof item.novelId === 'string' && typeof item.chapterId === 'string'
  );
}

export function listBookmarks(novelId?: string): ParagraphBookmark[] {
  return readJson<ParagraphBookmark[]>(BOOKMARKS_KEY, []).filter(
    (item) => item && typeof item.id === 'string' && (!novelId || item.novelId === novelId)
  );
}

export function isBookmarked(novelId: string, chapterId: string, paragraphId: string): boolean {
  return (
    Boolean(paragraphId) &&
    listBookmarks(novelId).some(
      (item) => item.chapterId === chapterId && item.paragraphId === paragraphId
    )
  );
}

export function toggleBookmark(
  position: Pick<
    StoredReadingPosition,
    'novelId' | 'chapterId' | 'chapterIndex' | 'paragraphId' | 'paragraphOffset'
  >
): boolean {
  if (!position.paragraphId) return false;
  const all = listBookmarks();
  const existing = all.find(
    (item) =>
      item.novelId === position.novelId &&
      item.chapterId === position.chapterId &&
      item.paragraphId === position.paragraphId
  );
  if (existing) {
    writeJson(
      BOOKMARKS_KEY,
      all.filter((item) => item.id !== existing.id)
    );
    return false;
  }

  const bookmark: ParagraphBookmark = {
    id: `${position.novelId}:${position.chapterId}:${position.paragraphId}`,
    ...position,
    createdAt: new Date().toISOString()
  };
  writeJson(BOOKMARKS_KEY, [bookmark, ...all].slice(0, 200));
  return true;
}

export function removeBookmark(id: string): void {
  writeJson(
    BOOKMARKS_KEY,
    listBookmarks().filter((item) => item.id !== id)
  );
}

export function readChapterIds(novelId: string): Set<string> {
  return new Set(
    readJson<string[]>(`${READ_KEY_PREFIX}${novelId}`, []).filter(
      (item) => typeof item === 'string'
    )
  );
}

export function markChapterRead(novelId: string, chapterId: string, notify = true): void {
  const ids = readChapterIds(novelId);
  if (ids.has(chapterId)) return;
  ids.add(chapterId);
  try {
    getStorage()?.setItem(`${READ_KEY_PREFIX}${novelId}`, JSON.stringify([...ids].sort()));
    if (notify) notifyChange();
  } catch {
    // Reading continuity is best-effort and must not block the reader.
  }
}

export function useReadingContinuityVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion((current) => current + 1);
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return version;
}
