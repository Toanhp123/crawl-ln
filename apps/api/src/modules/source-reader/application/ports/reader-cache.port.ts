export interface ReaderCacheEntry<T> {
  value: T;
  expiresAt: number;
  staleUntil?: number;
  tags: string[];
}

export interface ReaderCachePort {
  get<T>(key: string): Promise<ReaderCacheEntry<T> | undefined>;
  set<T>(key: string, entry: ReaderCacheEntry<T>): Promise<void>;
  invalidate(tags: string[]): Promise<void>;
}
