import type {
  ReaderCacheEntry,
  ReaderCachePort
} from '../../application/ports/reader-cache.port.js';

export class MemoryReaderCache implements ReaderCachePort {
  private readonly entries = new Map<string, ReaderCacheEntry<unknown>>();

  constructor(private readonly maxEntries: number) {}

  async get<T>(key: string): Promise<ReaderCacheEntry<T> | undefined> {
    const value = this.entries.get(key);
    if (!value) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value as ReaderCacheEntry<T>;
  }

  async set<T>(key: string, entry: ReaderCacheEntry<T>): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  async invalidate(tags: string[]): Promise<void> {
    const requested = new Set(tags);
    for (const [key, entry] of this.entries) {
      if (entry.metadata.tags.some((tag) => requested.has(tag))) this.entries.delete(key);
    }
  }
}
