import type {
  AuthExecutionResult,
  ChapterContent,
  ChapterSummary,
  LatestUpdate,
  NovelMetadata,
  NovelSearchResult,
  Page,
  PluginExecutionMode,
  PluginHttpResponse,
  PluginOperationResult,
  SourceCapability,
  SourceIdentity,
  SourcePluginManifest
} from '@novel-tool/source-plugin-sdk';
import type { PluginLifecycle } from './plugin-lifecycle.js';

export type {
  FormLoginManifestConfiguration,
  PluginAuthenticationManifest,
  PluginExecutionMode,
  PluginHttpResponse,
  PluginMatcher,
  PluginOperationResult,
  SourcePluginManifest
} from '@novel-tool/source-plugin-sdk';

export type PluginTrustLevel = 'built-in' | 'signed' | 'local-unverified' | 'blocked';
export type PluginStatus =
  | 'installed'
  | 'installed-pending-revalidation'
  | 'pending-approval'
  | 'initializing'
  | 'active'
  | 'degraded'
  | 'disabled'
  | 'quarantined'
  | 'failed';

export interface PluginHtmlNode {
  text(selector?: string): string;
  attr(name: string): string | undefined;
  html(selector?: string): string;
}

export interface PluginHtmlDocument {
  text(selector: string): string;
  attr(selector: string, name: string): string | undefined;
  html(selector: string): string;
  all(selector: string): PluginHtmlNode[];
  remove(selector: string): void;
}

export interface PluginContext {
  http: {
    get(
      url: string,
      options?: { headers?: Record<string, string>; timeoutMs?: number }
    ): Promise<PluginHttpResponse>;
  };
  html: { load(source: string): PluginHtmlDocument };
  url: { normalize(value: string): string; resolve(value: string, base: string): string };
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
    info(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
  };
  clock: { now(): string };
  signal: AbortSignal;
}

export interface PluginMatchRequest {
  url: string;
  normalizedUrl: string;
  domain: string;
  capability: SourceCapability;
}

export interface AuthenticationExtension {
  login(
    request: {
      credentialHandleId: string;
      fields?: Record<string, string>;
      routeIdentity?: string;
    },
    context?: PluginContext
  ): Promise<AuthExecutionResult>;
  refreshSession?(
    request: { sessionHandleId: string },
    context: PluginContext
  ): Promise<AuthExecutionResult>;
  logout?(request: { sessionHandleId: string }, context: PluginContext): Promise<void>;
  resumeChallenge?(
    request: {
      challengeId: string;
      challengeType?: string;
      response: Record<string, unknown>;
      opaqueState?: Record<string, unknown>;
      routeIdentity?: string;
    },
    context?: PluginContext
  ): Promise<AuthExecutionResult>;
}

export interface SourceReaderPlugin {
  manifest: SourcePluginManifest;
  lifecycle?: PluginLifecycle;
  authentication?: AuthenticationExtension;
  canHandle?(request: PluginMatchRequest, context: PluginContext): boolean | Promise<boolean>;
  identify?(
    request: { url: string },
    context: PluginContext
  ): Promise<PluginOperationResult<SourceIdentity>>;
  readMetadata?(
    request: { url: string },
    context: PluginContext
  ): Promise<PluginOperationResult<NovelMetadata>>;
  readChapterList?(
    request: { url: string; cursor?: string; limit: number },
    context: PluginContext
  ): Promise<PluginOperationResult<Page<ChapterSummary>>>;
  readChapterContent?(
    request: { url: string },
    context: PluginContext
  ): Promise<PluginOperationResult<ChapterContent>>;
  search?(
    request: { url: string; query: string; cursor?: string; limit: number },
    context: PluginContext
  ): Promise<PluginOperationResult<Page<NovelSearchResult>>>;
  latestUpdates?(
    request: { url: string; cursor?: string; limit: number },
    context: PluginContext
  ): Promise<PluginOperationResult<Page<LatestUpdate>>>;
}

export type SourcePluginExecutionMode = PluginExecutionMode;
