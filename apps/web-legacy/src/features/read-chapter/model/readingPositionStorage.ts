import { recordReadingActivity } from './readingContinuityStorage';
export interface StoredReadingPositionV1 {
  version: 1;
  novelId: string;
  chapterIndex: number;
  scrollRatio: number;
  updatedAt: string;
}
export interface StoredReadingPositionV2 {
  version: 2;
  novelId: string;
  chapterIndex: number;
  paragraphId: string;
  paragraphOffset: number;
  scrollRatio: number;
  updatedAt: string;
}
export interface StoredReadingPositionV3 extends Omit<StoredReadingPositionV2, 'version'> {
  version: 3;
  chapterId: string;
  chapterPosition?: number;
  chapterCount?: number;
  bookProgress?: number;
}
export type StoredReadingPosition = StoredReadingPositionV3;
export type ChapterPositionIdentity = { id: string; index: number };
const chapterKey = (novelId: string, chapterId: string) =>
  `novel-tool-position:v3:${novelId}:${chapterId}`;
const legacyChapterKey = (novelId: string, chapterIndex: number) =>
  `novel-tool-position:${novelId}:${chapterIndex}`;
const latestKey = (novelId: string) => `novel-tool-position:${novelId}:latest:v3`;
const legacyLatestKey = (novelId: string) => `novel-tool-position:${novelId}:latest`;
const clampRatio = (value: number) => Math.max(0, Math.min(1, value));
function isV3(value: unknown): value is StoredReadingPositionV3 {
  const x = value as Partial<StoredReadingPositionV3>;
  return (
    !!x &&
    x.version === 3 &&
    typeof x.novelId === 'string' &&
    typeof x.chapterId === 'string' &&
    Number.isInteger(x.chapterIndex) &&
    typeof x.paragraphId === 'string' &&
    typeof x.paragraphOffset === 'number' &&
    typeof x.scrollRatio === 'number' &&
    (x.chapterPosition === undefined || Number.isInteger(x.chapterPosition)) &&
    (x.chapterCount === undefined || Number.isInteger(x.chapterCount)) &&
    (x.bookProgress === undefined || typeof x.bookProgress === 'number') &&
    typeof x.updatedAt === 'string'
  );
}
function normalize(value: StoredReadingPositionV3): StoredReadingPositionV3 {
  return {
    ...value,
    paragraphOffset: Math.max(0, value.paragraphOffset),
    scrollRatio: clampRatio(value.scrollRatio),
    bookProgress: value.bookProgress === undefined ? undefined : clampRatio(value.bookProgress)
  };
}
export function saveReadingPosition(value: StoredReadingPositionV3) {
  try {
    const normalized = normalize(value);
    const serialized = JSON.stringify(normalized);
    localStorage.setItem(chapterKey(value.novelId, value.chapterId), serialized);
    localStorage.setItem(latestKey(value.novelId), serialized);
    recordReadingActivity(normalized);
  } catch {}
}
export function readReadingPosition(
  novelId: string,
  identity: ChapterPositionIdentity
): StoredReadingPositionV3 | null {
  try {
    const raw = localStorage.getItem(chapterKey(novelId, identity.id));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isV3(parsed) && parsed.novelId === novelId && parsed.chapterId === identity.id)
        return normalize({ ...parsed, chapterIndex: identity.index });
    }
    const legacyRaw = localStorage.getItem(legacyChapterKey(novelId, identity.index));
    if (!legacyRaw) return null;
    const legacy = JSON.parse(legacyRaw) as Partial<{
      version: 1 | 2;
      novelId: string;
      chapterIndex: number;
      paragraphId: string;
      paragraphOffset: number;
      scrollRatio: number;
      updatedAt: string;
    }>;
    if (
      (legacy.version === 1 || legacy.version === 2) &&
      legacy.novelId === novelId &&
      legacy.chapterIndex === identity.index &&
      typeof legacy.scrollRatio === 'number'
    ) {
      const migrated: StoredReadingPositionV3 = {
        version: 3,
        novelId,
        chapterId: identity.id,
        chapterIndex: identity.index,
        paragraphId: typeof legacy.paragraphId === 'string' ? legacy.paragraphId : '',
        paragraphOffset: typeof legacy.paragraphOffset === 'number' ? legacy.paragraphOffset : 0,
        scrollRatio: clampRatio(legacy.scrollRatio),
        updatedAt:
          typeof legacy.updatedAt === 'string' ? legacy.updatedAt : new Date().toISOString()
      };
      saveReadingPosition(migrated);
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}
export function readLatestReadingPosition(novelId: string): StoredReadingPositionV3 | null {
  try {
    const raw = localStorage.getItem(latestKey(novelId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isV3(parsed) && parsed.novelId === novelId ? normalize(parsed) : null;
  } catch {
    return null;
  }
}
export function readLegacyLatestReadingPosition(novelId: string): StoredReadingPositionV2 | null {
  try {
    const raw = localStorage.getItem(legacyLatestKey(novelId));
    if (!raw) return null;
    const x = JSON.parse(raw) as Partial<StoredReadingPositionV2>;
    return x.version === 2 &&
      x.novelId === novelId &&
      Number.isInteger(x.chapterIndex) &&
      typeof x.scrollRatio === 'number'
      ? (x as StoredReadingPositionV2)
      : null;
  } catch {
    return null;
  }
}
