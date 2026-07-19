import type { AuthExecutionResult } from '../auth/authentication.js';
import type {
  ChapterContent,
  ChapterSummary,
  LatestUpdate,
  NovelMetadata,
  NovelSearchResult,
  Page,
  SourceCapability,
  SourceIdentity,
  SourceReaderWarning,
  VersionedExtensionValue
} from '../../public/source-reader.models.js';

export type PluginExecutionMode = 'in-process' | 'isolated';
export type PluginTrustLevel = 'built-in' | 'signed' | 'local-unverified' | 'blocked';
export type PluginStatus =
  | 'installed'
  | 'pending-approval'
  | 'initializing'
  | 'active'
  | 'degraded'
  | 'disabled'
  | 'quarantined'
  | 'failed';

export interface PluginMatcher {
  hosts: string[];
  include?: string[];
  exclude?: string[];
  capabilities?: SourceCapability[];
  priority: number;
}

export interface SourcePluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  engines: { sourceReader: string };
  capabilities: SourceCapability[];
  contracts: Partial<Record<SourceCapability, number>>;
  matchers: PluginMatcher[];
  runtime: { preferredMode: PluginExecutionMode; requiresBrowser?: boolean };
  permissions: {
    network: { hosts: string[] };
    browser?: boolean;
    authentication?: boolean;
    persistentCache?: boolean;
    externalAssets?: string[];
  };
  runtimeRequirements?: {
    authentication?: {
      required: boolean;
      methods: Array<'cookie-import' | 'bearer-token' | 'basic-auth' | 'form-login' | 'custom'>;
    };
    network?: {
      required: boolean;
      regions?: string[];
      routeTags?: string[];
      allowDirectFallback: boolean;
    };
  };
  extensionContracts?: Record<string, { version: number; schema: string; required?: boolean }>;
}

export interface PluginHttpResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  data: string;
}

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

export interface PluginOperationResult<T> {
  data: T;
  extensions?: Record<string, VersionedExtensionValue>;
  warnings?: SourceReaderWarning[];
  cacheHints?: {
    scope?: 'public' | 'account' | 'user' | 'session' | 'none';
    ttlMs?: number;
    staleWhileRevalidateMs?: number;
    immutable?: boolean;
    tags?: string[];
  };
}

export interface AuthenticationExtension {
  login(
    request: { credentialHandleId: string },
    context: PluginContext
  ): Promise<AuthExecutionResult>;
  refreshSession?(
    request: { sessionHandleId: string },
    context: PluginContext
  ): Promise<AuthExecutionResult>;
  logout?(request: { sessionHandleId: string }, context: PluginContext): Promise<void>;
  resumeChallenge?(
    request: { challengeId: string; response: Record<string, unknown> },
    context: PluginContext
  ): Promise<AuthExecutionResult>;
}

export interface SourceReaderPlugin {
  manifest: SourcePluginManifest;
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
