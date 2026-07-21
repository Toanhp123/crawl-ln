export type CacheScope = 'public' | 'account' | 'user' | 'session' | 'none';

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

export interface PluginCacheHints {
  scope?: CacheScope;
  ttlMs?: number;
  staleWhileRevalidateMs?: number;
  immutable?: boolean;
  tags?: string[];
}

export interface PluginOperationResult<T> {
  data: T;
  extensions?: Record<string, VersionedExtensionValue>;
  warnings?: SourceReaderWarning[];
  cacheHints?: PluginCacheHints;
}

export type AuthenticationStrategy =
  'cookie-import' | 'bearer-token' | 'basic-auth' | 'form-login' | 'custom';

export interface AuthCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
}

export interface AuthSessionMaterial {
  kind: 'cookies' | 'headers' | 'combined';
  cookies?: AuthCookie[];
  headers?: Record<string, string>;
  expiresAt?: string;
  networkBinding: 'none' | 'preferred' | 'required';
}

export interface AuthChallenge {
  id: string;
  type: 'otp' | 'captcha' | 'approval' | 'browser-interaction';
  expiresAt: string;
  userInstructions?: string;
  opaqueState?: Record<string, unknown>;
}

export type AuthExecutionResult =
  | { status: 'authenticated'; session: AuthSessionMaterial }
  | { status: 'challenge-required'; challenge: AuthChallenge };
