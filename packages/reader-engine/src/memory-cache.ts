import type { ReaderChapterCache, ReaderChapterIdentity } from './contracts.js';

export class MemoryReaderChapterCache<
  TChapter extends ReaderChapterIdentity
> implements ReaderChapterCache<TChapter> {
  private readonly items = new Map<string, TChapter>();

  constructor(private readonly limit = 8) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('Reader memory cache limit must be a positive integer');
    }
  }

  private key(novelId: string, chapterId: string): string {
    return `${novelId}:${chapterId}`;
  }

  async get(novelId: string, identity: ReaderChapterIdentity): Promise<TChapter | null> {
    const key = this.key(novelId, identity.id);
    const value = this.items.get(key) ?? null;
    if (!value || value.contentVersion !== identity.contentVersion) {
      if (value) this.items.delete(key);
      return null;
    }

    this.items.delete(key);
    this.items.set(key, value);
    return value;
  }

  async set(novelId: string, chapter: TChapter): Promise<void> {
    const key = this.key(novelId, chapter.id);
    this.items.delete(key);
    this.items.set(key, chapter);
    while (this.items.size > this.limit) {
      const oldest = this.items.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.items.delete(oldest);
    }
  }
}
