import type {
  ReaderCacheEntry,
  ReaderCachePort
} from '../../application/ports/reader-cache.port.js';

export class TieredReaderCache implements ReaderCachePort {
  constructor(
    private readonly memory: ReaderCachePort,
    private readonly persistent: ReaderCachePort
  ) {}

  async get<T>(key: string): Promise<ReaderCacheEntry<T> | undefined> {
    const hot = await this.memory.get<T>(key);
    if (hot) return hot;
    const persisted = await this.persistent.get<T>(key);
    if (persisted) await this.memory.set(key, persisted);
    return persisted;
  }

  async set<T>(key: string, entry: ReaderCacheEntry<T>): Promise<void> {
    await Promise.all([this.memory.set(key, entry), this.persistent.set(key, entry)]);
  }

  async invalidate(tags: string[]): Promise<void> {
    await Promise.all([this.memory.invalidate(tags), this.persistent.invalidate(tags)]);
  }
}
