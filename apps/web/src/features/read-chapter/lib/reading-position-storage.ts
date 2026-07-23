import { recordReadingActivity } from './reading-continuity-storage';

export interface StoredReadingPosition {
  schemaVersion: 1;
  novelId: string;
  chapterId: string;
  chapterIndex: number;
  paragraphId: string;
  paragraphOffset: number;
  scrollRatio: number;
  updatedAt: string;
  chapterPosition?: number;
  chapterCount?: number;
  bookProgress?: number;
}

export type ChapterPositionIdentity = { id: string; index: number };

const chapterKey = (novelId: string, chapterId: string) =>
  `novel-tool-reader-position:${novelId}:${chapterId}`;
const latestKey = (novelId: string) => `novel-tool-reader-position:${novelId}:latest`;
const clampRatio = (value: number) => Math.max(0, Math.min(1, value));

function browserStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function isStoredReadingPosition(value: unknown): value is StoredReadingPosition {
  const item = value as Partial<StoredReadingPosition>;
  return (
    Boolean(item) &&
    item.schemaVersion === 1 &&
    typeof item.novelId === 'string' &&
    typeof item.chapterId === 'string' &&
    Number.isInteger(item.chapterIndex) &&
    typeof item.paragraphId === 'string' &&
    typeof item.paragraphOffset === 'number' &&
    typeof item.scrollRatio === 'number' &&
    (item.chapterPosition === undefined || Number.isInteger(item.chapterPosition)) &&
    (item.chapterCount === undefined || Number.isInteger(item.chapterCount)) &&
    (item.bookProgress === undefined || typeof item.bookProgress === 'number') &&
    typeof item.updatedAt === 'string'
  );
}

function normalize(value: StoredReadingPosition): StoredReadingPosition {
  return {
    ...value,
    paragraphOffset: Math.max(0, value.paragraphOffset),
    scrollRatio: clampRatio(value.scrollRatio),
    ...(value.bookProgress === undefined ? {} : { bookProgress: clampRatio(value.bookProgress) })
  };
}

export function saveReadingPosition(
  value: StoredReadingPosition,
  storage: Storage | null = browserStorage()
): void {
  try {
    const normalized = normalize(value);
    const serialized = JSON.stringify(normalized);
    storage?.setItem(chapterKey(value.novelId, value.chapterId), serialized);
    storage?.setItem(latestKey(value.novelId), serialized);
    recordReadingActivity(normalized);
  } catch {
    // Position persistence is best-effort and must not block the reader.
  }
}

export function readReadingPosition(
  novelId: string,
  identity: ChapterPositionIdentity,
  storage: Storage | null = browserStorage()
): StoredReadingPosition | null {
  try {
    const raw = storage?.getItem(chapterKey(novelId, identity.id));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isStoredReadingPosition(parsed) ||
      parsed.novelId !== novelId ||
      parsed.chapterId !== identity.id
    ) {
      return null;
    }
    return normalize({ ...parsed, chapterIndex: identity.index });
  } catch {
    return null;
  }
}

export function readLatestReadingPosition(
  novelId: string,
  storage: Storage | null = browserStorage()
): StoredReadingPosition | null {
  try {
    const raw = storage?.getItem(latestKey(novelId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredReadingPosition(parsed) && parsed.novelId === novelId ? normalize(parsed) : null;
  } catch {
    return null;
  }
}
