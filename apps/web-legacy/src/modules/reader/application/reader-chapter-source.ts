import type { Chapter } from '@novel-tool/shared';

export type ReaderChapterIdentity = Pick<Chapter, 'id' | 'index' | 'contentVersion'>;

export interface ReaderChapterCache {
  get(novelId: string, chapterId: string, contentVersion: number): Promise<Chapter | null>;
  set(novelId: string, chapter: Chapter): Promise<void>;
}

export class MemoryReaderChapterCache implements ReaderChapterCache {
  private readonly items = new Map<string, Chapter>();
  constructor(private readonly limit = 5) {}
  private key(novelId: string, chapterId: string) {
    return `${novelId}:${chapterId}`;
  }
  async get(novelId: string, chapterId: string, contentVersion: number) {
    const key = this.key(novelId, chapterId);
    const value = this.items.get(key) ?? null;
    if (!value || value.contentVersion !== contentVersion) {
      if (value) this.items.delete(key);
      return null;
    }
    this.items.delete(key);
    this.items.set(key, value);
    return value;
  }
  async set(novelId: string, chapter: Chapter) {
    const key = this.key(novelId, chapter.id);
    this.items.delete(key);
    this.items.set(key, chapter);
    while (this.items.size > this.limit)
      this.items.delete(this.items.keys().next().value as string);
  }
}

export class StaleChapterListError extends Error {
  constructor() {
    super('The chapter list is stale; refresh it before continuing');
    this.name = 'StaleChapterListError';
  }
}

export class ReaderChapterSource {
  constructor(
    private readonly memory: ReaderChapterCache,
    private readonly loader: (
      novelId: string,
      chapterIndex: number,
      signal?: AbortSignal
    ) => Promise<Chapter>,
    private readonly disk?: ReaderChapterCache
  ) {}

  async load(novelId: string, identity: ReaderChapterIdentity, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const memory = await this.memory.get(novelId, identity.id, identity.contentVersion);
    if (memory) return memory;
    signal?.throwIfAborted();
    const disk = await this.disk?.get(novelId, identity.id, identity.contentVersion);
    if (disk) {
      await this.memory.set(novelId, disk);
      return disk;
    }
    signal?.throwIfAborted();
    const loaded = await this.loader(novelId, identity.index, signal);
    if (loaded.id !== identity.id) throw new StaleChapterListError();
    signal?.throwIfAborted();
    await Promise.all([this.memory.set(novelId, loaded), this.disk?.set(novelId, loaded)]);
    return loaded;
  }
}
