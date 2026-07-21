import type {
  CacheScope,
  SourceCapability,
  SourceReaderResult,
  SourceReaderWarning,
  VersionedExtensionValue
} from '../public/source-reader.models.js';
import type { SourcePluginManifest } from '../domain/plugin/source-plugin.js';
import type { ReaderCacheEntry, ReaderCachePort } from './ports/reader-cache.port.js';

export type ExecutableSourceCapability = Exclude<SourceCapability, 'authentication'>;

export interface SourceReaderMatcher {
  hosts: string[];
  include?: string[];
  exclude?: string[];
  capabilities?: SourceCapability[];
}

export interface SourceReaderExtensionContract {
  version: string;
  required: boolean;
  validate(
    value: unknown
  ):
    | { success: true; data: unknown }
    | { success: false; issues: Array<{ path: string; message: string }> };
}

export interface SourceReaderCandidate {
  pluginId: string;
  pluginVersion: string;
  domain: string;
  normalizedUrl: string;
  priority: number;
  trustLevel: 'built-in' | 'external';
  executionMode: 'in-process' | 'isolated';
  contractVersion: number;
  extensionContractVersions?: Record<string, string>;
  extensionContracts?: Record<string, SourceReaderExtensionContract>;
  matcher?: SourceReaderMatcher;
  allowedHosts?: string[];
  runtimeRequirements?: SourcePluginManifest['runtimeRequirements'];
  requiresBrowser?: boolean;
}

export interface SourceReaderExecutableRequest {
  url: string;
  requestId?: string;
  signal?: AbortSignal;
  freshOnly?: boolean;
  timeoutMs?: number;
  cursor?: string;
  limit?: number;
  query?: string;
  userId?: string;
  credentialProfileId?: string;
  networkProfileId?: string;
}

export interface SourceReaderRuntimeContext {
  cacheIdentity: {
    public: 'public';
    account?: string;
    user?: string;
    session?: string;
    network: string;
  };
  credentialId?: string;
  sessionId?: string;
  networkProfileId?: string;
  browserRequired?: boolean;
  requestId?: string;
  runtime?: unknown;
}

export interface SourceReaderCandidateRegistryPort {
  listCandidates(input: {
    url: string;
    capability: ExecutableSourceCapability;
  }): Promise<SourceReaderCandidate[]>;
  hasAnyCandidate?(url: string): Promise<boolean>;
}

export interface SourceReaderRuntimeContextPort {
  resolve(input: {
    candidate: SourceReaderCandidate;
    capability: ExecutableSourceCapability;
    request: SourceReaderExecutableRequest;
  }): Promise<SourceReaderRuntimeContext>;
}

export interface SourceReaderOperationResult<TData = unknown> {
  data: TData;
  extensions?: Record<string, VersionedExtensionValue>;
  warnings?: SourceReaderWarning[];
  cacheHints?: {
    scope?: CacheScope;
    ttlMs?: number;
    staleWhileRevalidateMs?: number;
    tags?: string[];
  };
}

export interface SourceReaderInvocationPort {
  invoke(input: {
    candidate: SourceReaderCandidate;
    capability: ExecutableSourceCapability;
    request: Record<string, unknown>;
    context: SourceReaderRuntimeContext;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<SourceReaderOperationResult>;
}

export interface SourceReaderInvocationGuardPort {
  enter(input: {
    candidate: SourceReaderCandidate;
    capability: ExecutableSourceCapability;
    context: SourceReaderRuntimeContext;
    signal?: AbortSignal;
  }): Promise<() => void>;
}

export interface SourceReaderResultValidatorPort {
  validate(
    capability: ExecutableSourceCapability,
    data: unknown,
    extensions?: Record<string, VersionedExtensionValue>,
    candidate?: SourceReaderCandidate
  ): {
    data: unknown;
    extensions?: Record<string, VersionedExtensionValue>;
    warnings?: SourceReaderWarning[];
  };
}

export type SourceReaderCacheEntry<T> = ReaderCacheEntry<T>;

export interface SourceReaderCachePort extends Pick<ReaderCachePort, 'get' | 'set'> {}

export interface SourceReaderRefreshPort {
  schedule(key: string, refresh: () => Promise<unknown>): void;
}

export interface SourceReaderHealthPort {
  isEligible(input: {
    candidate: SourceReaderCandidate;
    capability: ExecutableSourceCapability;
  }): Promise<boolean>;
  recordSuccess(input: {
    candidate: SourceReaderCandidate;
    capability: ExecutableSourceCapability;
    durationMs: number;
  }): Promise<void>;
  recordFailure(input: {
    candidate: SourceReaderCandidate;
    capability: ExecutableSourceCapability;
    durationMs: number;
    failureCode: string;
  }): Promise<void>;
  quarantineIntegrityFailure?(input: {
    candidate: SourceReaderCandidate;
    failureCode: string;
  }): Promise<void>;
}

export interface SourceReaderCursorPayload {
  pluginId: string;
  pluginVersion: string;
  capability: ExecutableSourceCapability;
  contractVersion: number;
  requestFingerprint: string;
  extensionContractVersions: Record<string, string>;
  pluginCursor?: string;
  offset: number;
  expiresAt: number;
}

export interface SourceReaderCursorPort {
  encode(payload: SourceReaderCursorPayload): string;
  decode(token: string): SourceReaderCursorPayload;
}

export interface SourceReaderPipelinePorts {
  contexts: SourceReaderRuntimeContextPort;
  validator: SourceReaderResultValidatorPort;
}

export type CachedSourceReaderResult<T = unknown> = SourceReaderResult<T>;
