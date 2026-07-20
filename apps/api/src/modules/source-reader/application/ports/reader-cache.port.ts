export interface ReaderCacheMetadata {
  pluginId: string;
  pluginVersion: string;
  capability: string;
  contractVersion: string;
  extensionContractVersions: Record<string, string>;
  requestFingerprint: string;
  normalizedUrl?: string;
  scope: 'public' | 'account' | 'user' | 'session';
  scopeIdentityHash: string;
  networkIdentityHash: string;
  tags: string[];
}

export interface ReaderCacheEntry<T> {
  value: T;
  expiresAt: number;
  staleUntil?: number;
  metadata: ReaderCacheMetadata;
}

export interface ReaderCachePort {
  get<T>(key: string): Promise<ReaderCacheEntry<T> | undefined>;
  set<T>(key: string, entry: ReaderCacheEntry<T>): Promise<void>;
  invalidate(tags: string[]): Promise<void>;
}
