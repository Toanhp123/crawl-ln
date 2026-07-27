export const SOURCE_PLUGIN_STUDIO_SDK_TYPES = String.raw`
declare module '@novel-tool/source-plugin-sdk' {
  export type Awaitable<T> = T | Promise<T>;
  export type SourceDataCapability =
    | 'identify'
    | 'metadata'
    | 'chapter-list'
    | 'chapter-content'
    | 'search'
    | 'latest-updates';
  export type SourceCapability = SourceDataCapability | 'authentication';
  export type CacheScope = 'public' | 'account' | 'user' | 'session' | 'none';

  export interface PluginHttpRequestOptions {
    headers?: Record<string, string>;
    timeoutMs?: number;
  }
  export interface PluginHttpResponse {
    url: string;
    status: number;
    headers: Record<string, string>;
    data: string;
  }
  export interface ExternalPluginHtmlNode {
    text(selector?: string): Promise<string>;
    attr(name: string): Promise<string | undefined>;
    html(selector?: string): Promise<string>;
  }
  export interface ExternalPluginHtmlDocument {
    text(selector: string): Promise<string>;
    attr(selector: string, name: string): Promise<string | undefined>;
    html(selector: string): Promise<string>;
    all(selector: string): Promise<ExternalPluginHtmlNode[]>;
    remove(selector: string): Promise<void>;
  }
  export interface ExternalPluginSignal { readonly aborted: boolean; }
  export interface ExternalPluginContext {
    http: { get(url: string, options?: PluginHttpRequestOptions): Promise<PluginHttpResponse> };
    html: { load(source: string): ExternalPluginHtmlDocument };
    url: {
      normalize(value: string): Promise<string>;
      resolve(value: string, base: string): Promise<string>;
    };
    cache: {
      get<T>(key: string): Promise<T | undefined>;
      set<T>(key: string, value: T, ttlMs: number): Promise<void>;
    };
    browser?: {
      open(url: string): Promise<void>;
      waitFor(selector: string): Promise<void>;
      text(selector: string): Promise<string | null>;
      html(selector: string): Promise<string | null>;
      click(selector: string): Promise<void>;
      fillSecret(selector: string, handle: { credentialId: string; field: string }): Promise<void>;
      cookies(): Promise<Array<Record<string, unknown>>>;
    };
    logger: {
      info(message: string, metadata?: Record<string, unknown>): Promise<void>;
      warn(message: string, metadata?: Record<string, unknown>): Promise<void>;
    };
    clock: { now(): string };
    host: { clockNow(): Promise<string> };
    signal: ExternalPluginSignal;
    normalizedUrl: string;
  }

  export interface Page<T> { items: T[]; nextCursor?: string; hasMore: boolean; }
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
    extensions?: Record<string, { version: number; data: unknown }>;
    warnings?: SourceReaderWarning[];
    cacheHints?: PluginCacheHints;
  }

  export interface IdentifyRequest { url: string; }
  export interface ReadMetadataRequest { url: string; }
  export interface ReadChapterListRequest { url: string; cursor?: string; limit: number; }
  export interface ReadChapterContentRequest { url: string; }
  export interface SearchSourceRequest { url: string; query: string; cursor?: string; limit: number; }
  export interface LatestUpdatesRequest { url: string; cursor?: string; limit: number; }
  export interface ExternalProbeRequest {
    normalizedUrl: string;
    domain: string;
    capability: SourceCapability;
  }
  export interface PluginLifecycleContext {
    pluginId: string;
    pluginVersion: string;
    protocolVersion: number;
    now: string;
  }
  export type PluginShutdownReason = 'upgrade' | 'disable' | 'quarantine' | 'application-stop';
  export interface PluginHealthResult { status: 'healthy' | 'degraded'; details?: Record<string, string>; }

  export type SourcePluginErrorCode =
    | 'AUTHENTICATION_REQUIRED'
    | 'AUTHENTICATION_FAILED'
    | 'NETWORK_ACCESS_BLOCKED'
    | 'SOURCE_RESPONSE_TOO_LARGE'
    | 'SOURCE_RATE_LIMITED'
    | 'SOURCE_TEMPORARILY_UNAVAILABLE'
    | 'UPSTREAM_CHALLENGE_DETECTED'
    | 'CURSOR_INVALID'
    | 'PLUGIN_RESULT_INVALID'
    | 'SOURCE_READER_CANCELLED';
  export class SourcePluginError extends Error {
    readonly code: SourcePluginErrorCode;
    constructor(code: SourcePluginErrorCode, message: string);
  }

  export interface ExternalSourcePlugin {
    initialize?(request: PluginLifecycleContext, context: ExternalPluginContext): Awaitable<void>;
    healthCheck?(request: Record<string, never>, context: ExternalPluginContext): Awaitable<PluginHealthResult>;
    shutdown?(request: { reason: PluginShutdownReason }, context: ExternalPluginContext): Awaitable<void>;
    probeCanHandle?(request: ExternalProbeRequest, context: ExternalPluginContext): Awaitable<boolean>;
    identify?(request: IdentifyRequest, context: ExternalPluginContext): Awaitable<PluginOperationResult<SourceIdentity>>;
    readMetadata?(request: ReadMetadataRequest, context: ExternalPluginContext): Awaitable<PluginOperationResult<NovelMetadata>>;
    readChapterList?(request: ReadChapterListRequest, context: ExternalPluginContext): Awaitable<PluginOperationResult<Page<ChapterSummary>>>;
    readChapterContent?(request: ReadChapterContentRequest, context: ExternalPluginContext): Awaitable<PluginOperationResult<ChapterContent>>;
    search?(request: SearchSourceRequest, context: ExternalPluginContext): Awaitable<PluginOperationResult<Page<NovelSearchResult>>>;
    latestUpdates?(request: LatestUpdatesRequest, context: ExternalPluginContext): Awaitable<PluginOperationResult<Page<LatestUpdate>>>;
  }

  export type ExternalSourcePluginFactory = (
    context: ExternalPluginContext
  ) => Awaitable<ExternalSourcePlugin>;

  export function defineSourcePlugin<T extends ExternalSourcePlugin>(plugin: T): T;
}
`;
