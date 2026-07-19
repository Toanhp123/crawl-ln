export type SourceCapability =
  | 'identify'
  | 'metadata'
  | 'chapter-list'
  | 'chapter-content'
  | 'search'
  | 'latest-updates'
  | 'authentication';

export type CacheScope = 'public' | 'account' | 'user' | 'session' | 'none';

export interface SourceReaderRequestContext {
  requestId?: string;
  userId?: string;
  credentialProfileId?: string;
  networkProfileId?: string;
  freshOnly?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface IdentifyRequest extends SourceReaderRequestContext {
  url: string;
}

export interface ReadMetadataRequest extends SourceReaderRequestContext {
  url: string;
}

export interface ReadChapterListRequest extends SourceReaderRequestContext {
  url: string;
  cursor?: string;
  limit?: number;
}

export interface StreamChapterListRequest extends SourceReaderRequestContext {
  url: string;
  batchSize?: number;
}

export interface ReadChapterContentRequest extends SourceReaderRequestContext {
  url: string;
}

export interface SearchSourceRequest extends SourceReaderRequestContext {
  url: string;
  query: string;
  cursor?: string;
  limit?: number;
}

export interface LatestUpdatesRequest extends SourceReaderRequestContext {
  url: string;
  cursor?: string;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface SourceIdentity {
  normalizedUrl: string;
  domain: string;
  pageType: 'novel' | 'chapter' | 'search' | 'latest' | 'unknown';
}

export interface NovelMetadata {
  title: string;
  sourceUrl: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  status?: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
}

export interface ChapterSummary {
  index: number;
  title: string;
  url: string;
  publishedAt?: string;
}

export interface ChapterContent {
  title: string;
  url: string;
  rawText: string;
  cleanText: string;
}

export interface NovelSearchResult {
  title: string;
  url: string;
  author?: string;
  coverUrl?: string;
}

export interface LatestUpdate {
  novelTitle: string;
  novelUrl: string;
  chapterTitle?: string;
  chapterUrl?: string;
  updatedAt?: string;
}

export interface VersionedExtensionValue {
  version: number;
  data: unknown;
}

export interface SourceReaderWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SourceReaderResult<TData> {
  data: TData;
  source: {
    pluginId: string;
    pluginVersion: string;
    domain: string;
    capability: SourceCapability;
  };
  extensions?: Record<string, VersionedExtensionValue>;
  warnings?: SourceReaderWarning[];
}
