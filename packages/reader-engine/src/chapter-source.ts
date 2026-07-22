import type {
  ReaderChapterCache,
  ReaderChapterIdentity,
  ReaderChapterLoader,
  ReaderChapterSourceApi
} from './contracts.js';

export class StaleChapterListError extends Error {
  constructor() {
    super('The chapter list is stale; refresh it before continuing');
    this.name = 'StaleChapterListError';
  }
}

export class ReaderChapterSource<
  TChapter extends ReaderChapterIdentity
> implements ReaderChapterSourceApi<TChapter> {
  constructor(
    private readonly memory: ReaderChapterCache<TChapter>,
    private readonly loader: ReaderChapterLoader<TChapter>,
    private readonly persistent?: ReaderChapterCache<TChapter>
  ) {}

  async load(
    novelId: string,
    identity: ReaderChapterIdentity,
    signal: AbortSignal
  ): Promise<TChapter> {
    signal.throwIfAborted();
    const memory = await this.memory.get(novelId, identity);
    signal.throwIfAborted();
    if (memory) return memory;

    const persistent = await this.persistent?.get(novelId, identity);
    signal.throwIfAborted();
    if (persistent) {
      await this.memory.set(novelId, persistent);
      signal.throwIfAborted();
      return persistent;
    }

    const loaded = await this.loader.load(novelId, identity.index, signal);
    signal.throwIfAborted();
    if (loaded.id !== identity.id) throw new StaleChapterListError();

    await this.memory.set(novelId, loaded);
    signal.throwIfAborted();
    if (this.persistent) {
      await this.persistent.set(novelId, loaded);
      signal.throwIfAborted();
    }
    return loaded;
  }
}
