import { createHash, randomUUID } from 'node:crypto';
import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { BrowserRuntimePort } from '../ports/browser-runtime.port.js';
import type { CursorCodecPort, CursorPayload } from '../ports/cursor-codec.port.js';
import type { PluginContextFactoryPort } from '../ports/plugin-context-factory.port.js';
import type { PluginCandidate, PluginRegistryPort } from '../ports/plugin-registry.port.js';
import type { PluginRuntimePort } from '../ports/plugin-runtime.port.js';
import type { ReaderCachePort } from '../ports/reader-cache.port.js';
import type { SourceReaderObservabilityPort } from '../ports/source-reader-observability.port.js';
import type {
  ResolvedRuntimeContext,
  RuntimeContextResolverPort
} from '../ports/runtime-context-resolver.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { PluginOperationResult } from '../../domain/plugin/source-plugin.js';
import type {
  CacheScope,
  ChapterContent,
  ChapterSummary,
  IdentifyRequest,
  LatestUpdate,
  LatestUpdatesRequest,
  NovelMetadata,
  NovelSearchResult,
  Page,
  ReadChapterContentRequest,
  ReadChapterListRequest,
  ReadMetadataRequest,
  SearchSourceRequest,
  SourceCapability,
  SourceIdentity,
  SourceReaderResult,
  StreamChapterListRequest
} from '../../public/source-reader.models.js';
import type { SourceReaderApi } from '../../public/source-reader.api.js';
import { validatePluginResult } from './plugin-result-validator.js';
import { buildSourceReaderCacheKey, resolveCacheScopeIdentity } from './source-reader-cache-key.js';
import { SourceReaderCircuitBreaker } from './source-reader-circuit-breaker.js';
import type { SourceReaderRateLimiterPort } from './source-reader-rate-limiter.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const CURSOR_TTL_MS = 24 * 60 * 60_000;
const DISCOVERABLE_CAPABILITIES: Array<Exclude<SourceCapability, 'authentication'>> = [
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content',
  'search',
  'latest-updates'
];

type PagedCapability = 'chapter-list' | 'search' | 'latest-updates';

interface ExecutableRequest {
  url: string;
  requestId?: string;
  signal?: AbortSignal;
  freshOnly?: boolean;
  cursor?: string;
  limit?: number;
  query?: string;
  userId?: string;
  credentialProfileId?: string;
  networkProfileId?: string;
}

const anonymousRuntimeContexts: RuntimeContextResolverPort = {
  async resolve(input) {
    return {
      executionMode: input.executionMode ?? 'in-process',
      browserRequired: false,
      resolvedNetworkRoute: { kind: 'direct', identity: 'direct' },
      cacheIdentity: { public: 'public', network: 'direct' }
    };
  }
};

export interface PluginHealthPolicy {
  isEligible(
    pluginId: string,
    pluginVersion: string,
    capability: SourceCapability
  ): Promise<boolean>;
  recordSuccess(input: {
    pluginId: string;
    pluginVersion: string;
    capability: SourceCapability;
    durationMs: number;
  }): Promise<void>;
  recordFailure(input: {
    pluginId: string;
    pluginVersion: string;
    capability: SourceCapability;
    durationMs: number;
    failureCode: string;
  }): Promise<void>;
  quarantineIntegrityFailure?(input: {
    pluginId: string;
    pluginVersion: string;
    failureCode: string;
  }): Promise<void>;
}

const alwaysHealthy: PluginHealthPolicy = {
  async isEligible() {
    return true;
  },
  async recordSuccess() {},
  async recordFailure() {}
};

const noObservability: SourceReaderObservabilityPort = {
  invocationStarted() {},
  invocationFinished() {},
  cacheHit() {},
  fallback() {}
};

const unlimitedRateLimiter: SourceReaderRateLimiterPort = {
  async enter() {
    return () => undefined;
  }
};

function isPagedCapability(
  capability: Exclude<SourceCapability, 'authentication'>
): capability is PagedCapability {
  return (
    capability === 'chapter-list' || capability === 'search' || capability === 'latest-updates'
  );
}

export class SourceReaderService implements SourceReaderApi {
  constructor(
    private readonly registry: PluginRegistryPort,
    private readonly runtime: PluginRuntimePort,
    private readonly contexts: PluginContextFactoryPort,
    private readonly cache: ReaderCachePort,
    private readonly cursors: CursorCodecPort,
    private readonly clock: ClockPort,
    private readonly runtimeContexts: RuntimeContextResolverPort = anonymousRuntimeContexts,
    private readonly health: PluginHealthPolicy = alwaysHealthy,
    private readonly browser?: BrowserRuntimePort,
    private readonly observability: SourceReaderObservabilityPort = noObservability,
    private readonly circuit: SourceReaderCircuitBreaker = new SourceReaderCircuitBreaker({
      failureThreshold: 5,
      openMs: 60_000
    }),
    private readonly rateLimiter: SourceReaderRateLimiterPort = unlimitedRateLimiter
  ) {}

  identify(request: IdentifyRequest) {
    return this.execute<SourceIdentity>('identify', request);
  }

  readMetadata(request: ReadMetadataRequest) {
    return this.execute<NovelMetadata>('metadata', request);
  }

  readChapterContent(request: ReadChapterContentRequest) {
    return this.execute<ChapterContent>('chapter-content', request);
  }

  search(request: SearchSourceRequest) {
    return this.execute<Page<NovelSearchResult>>('search', {
      ...request,
      limit: this.limit(request.limit)
    });
  }

  latestUpdates(request: LatestUpdatesRequest) {
    return this.execute<Page<LatestUpdate>>('latest-updates', {
      ...request,
      limit: this.limit(request.limit)
    });
  }

  readChapterList(request: ReadChapterListRequest) {
    return this.execute<Page<ChapterSummary>>('chapter-list', {
      ...request,
      limit: this.limit(request.limit)
    });
  }

  async *streamChapterList(request: StreamChapterListRequest) {
    const batchSize = this.limit(request.batchSize);
    let cursor: string | undefined;
    do {
      const page = await this.readChapterList({ ...request, cursor, limit: batchSize });
      yield { ...page, data: page.data.items };
      cursor = page.data.nextCursor;
    } while (cursor);
  }

  private async execute<T>(
    capability: Exclude<SourceCapability, 'authentication'>,
    request: ExecutableRequest
  ): Promise<SourceReaderResult<T>> {
    let candidates = await this.registry.listCandidates({ url: request.url, capability });
    if (candidates.length === 0) {
      const supported = await this.hasAnyCandidate(request.url);
      throw new SourceReaderError(
        supported ? 'CAPABILITY_NOT_SUPPORTED' : 'SOURCE_NOT_SUPPORTED',
        supported
          ? `No plugin supports ${capability} for ${request.url}`
          : `No plugin supports ${request.url}`,
        { retryable: false, fallbackAllowed: false }
      );
    }

    const cursorPayload = this.decodeCursor(capability, request.cursor);
    if (cursorPayload) {
      candidates = candidates.filter(
        (candidate) => candidate.plugin.manifest.id === cursorPayload.pluginId
      );
      if (candidates.length === 0) {
        this.cursorInvalidated('Cursor plugin is no longer available for this source');
      }
    }

    let lastError: unknown;
    for (const candidate of candidates) {
      const requestFingerprint = this.requestFingerprint(
        capability,
        candidate.normalizedUrl,
        request
      );
      this.validateCursorBinding(cursorPayload, capability, candidate, requestFingerprint);
      let invocationStartedAt: number | undefined;
      let observedInvocationId: string | undefined;
      let observedStartedAt: number | undefined;
      let circuitKey: string | undefined;
      let leaveRateLimit: (() => void) | undefined;

      try {
        const runtimeContext = await this.runtimeContexts.resolve({
          userId: request.userId,
          pluginId: candidate.plugin.manifest.id,
          pluginVersion: candidate.plugin.manifest.version,
          domain: candidate.domain,
          capability,
          credentialProfileId: request.credentialProfileId,
          networkProfileId: request.networkProfileId,
          executionMode: candidate.executionMode,
          runtimeRequirements: candidate.plugin.manifest.runtimeRequirements,
          requiresBrowser: candidate.plugin.manifest.runtime.requiresBrowser
        });
        const authenticationRequired =
          candidate.plugin.manifest.runtimeRequirements?.authentication?.required === true;
        if (authenticationRequired && !runtimeContext.credential) {
          throw new SourceReaderError(
            'CREDENTIAL_NOT_CONFIGURED',
            'Credential is not configured for this source',
            { retryable: false, fallbackAllowed: false }
          );
        }
        if (authenticationRequired && !runtimeContext.session) {
          throw new SourceReaderError(
            'AUTHENTICATION_REQUIRED',
            'Login is required before reading this source',
            {
              retryable: false,
              fallbackAllowed: false,
              details: { credentialProfileId: runtimeContext.credential?.id }
            }
          );
        }
        if (!request.freshOnly) {
          for (const scope of this.cacheLookupScopes(runtimeContext)) {
            const cached = await this.cache.get<SourceReaderResult<T>>(
              this.cacheKey(capability, candidate, request, runtimeContext, scope)
            );
            if (cached && cached.expiresAt > this.clock.now().getTime()) {
              this.observability.cacheHit({
                pluginId: candidate.plugin.manifest.id,
                capability,
                stale: false
              });
              return cached.value;
            }
          }
        }
        if (!(await this.healthEligible(candidate, capability))) continue;

        invocationStartedAt = this.clock.now().getTime();
        const signal = request.signal ?? new AbortController().signal;
        circuitKey = `${candidate.plugin.manifest.id}:${capability}:${candidate.domain}:${
          runtimeContext.networkRoute?.routeType ?? 'direct'
        }`;
        if (!this.circuit.allow(circuitKey, invocationStartedAt)) continue;
        const rateKey = `${candidate.domain}:${runtimeContext.credential?.id ?? 'anonymous'}:${
          runtimeContext.networkRoute?.id ?? 'direct'
        }`;
        leaveRateLimit = await this.rateLimiter.enter(rateKey, signal);
        observedInvocationId = randomUUID();
        observedStartedAt = this.clock.now().getTime();
        this.observability.invocationStarted({
          requestId: request.requestId ?? 'untracked',
          invocationId: observedInvocationId,
          pluginId: candidate.plugin.manifest.id,
          capability,
          domain: candidate.domain,
          runtimeMode: candidate.executionMode
        });
        let browserSession;
        if (runtimeContext.browserRequired) {
          if (!candidate.plugin.manifest.permissions.browser) {
            throw new SourceReaderError(
              'PLUGIN_PERMISSION_DENIED',
              'Plugin browser permission is not approved',
              { retryable: false, fallbackAllowed: false }
            );
          }
          if (!this.browser || !runtimeContext.credential) {
            throw new SourceReaderError('PLUGIN_UNAVAILABLE', 'Browser runtime is unavailable', {
              retryable: true,
              fallbackAllowed: false
            });
          }
          const resolvedRoute = runtimeContext.resolvedNetworkRoute ?? {
            kind: 'direct' as const,
            identity: 'direct' as const
          };
          browserSession = await this.browser.open({
            identity: {
              ...(request.userId ? { userId: request.userId } : {}),
              pluginId: candidate.plugin.manifest.id,
              pluginVersion: candidate.plugin.manifest.version,
              sourceAccountId: runtimeContext.credential.id,
              credentialId: runtimeContext.credential.id,
              ...(runtimeContext.session ? { sessionId: runtimeContext.session.id } : {}),
              ...(runtimeContext.networkRoute
                ? { networkRouteId: runtimeContext.networkRoute.id }
                : {}),
              networkIdentity: resolvedRoute.identity
            },
            allowedHosts: candidate.plugin.manifest.permissions.network.hosts,
            route: resolvedRoute,
            signal
          });
        }
        const context = this.contexts.create({
          pluginId: candidate.plugin.manifest.id,
          allowedHosts: candidate.plugin.manifest.permissions.network.hosts,
          signal,
          runtimeContext,
          ...(browserSession ? { browserSession } : {})
        });
        if (candidate.plugin.canHandle) {
          const accepted = await candidate.plugin.canHandle(
            {
              url: request.url,
              normalizedUrl: candidate.normalizedUrl,
              domain: candidate.domain,
              capability
            },
            context
          );
          if (!accepted) {
            this.observability.invocationFinished({
              requestId: request.requestId ?? 'untracked',
              invocationId: observedInvocationId,
              pluginId: candidate.plugin.manifest.id,
              capability,
              runtimeMode: candidate.executionMode,
              result: 'skipped',
              durationMs: Math.max(0, this.clock.now().getTime() - observedStartedAt)
            });
            observedInvocationId = undefined;
            continue;
          }
        }

        const operation = (await this.runtime.invoke({
          registration: candidate,
          capability,
          request: this.pluginRequest(capability, request, cursorPayload),
          context
        })) as PluginOperationResult<T>;
        let data = validatePluginResult(capability, operation.data) as T;
        if (isPagedCapability(capability)) {
          data = this.paginateResult(
            capability,
            data as Page<unknown>,
            request,
            candidate,
            requestFingerprint,
            cursorPayload
          ) as T;
        }

        const result: SourceReaderResult<T> = {
          data,
          source: {
            pluginId: candidate.plugin.manifest.id,
            pluginVersion: candidate.plugin.manifest.version,
            domain: candidate.domain,
            capability
          },
          extensions: operation.extensions,
          warnings: operation.warnings
        };
        this.circuit.recordSuccess(circuitKey);
        this.observability.invocationFinished({
          requestId: request.requestId ?? 'untracked',
          invocationId: observedInvocationId,
          pluginId: candidate.plugin.manifest.id,
          capability,
          runtimeMode: candidate.executionMode,
          result: 'success',
          durationMs: Math.max(0, this.clock.now().getTime() - observedStartedAt)
        });
        observedInvocationId = undefined;
        await this.recordHealthSuccess(candidate, capability, invocationStartedAt);
        invocationStartedAt = undefined;
        const ttlMs = Math.max(
          0,
          Math.min(operation.cacheHints?.ttlMs ?? 0, 30 * 24 * 60 * 60_000)
        );
        const effectiveScope = this.narrowCacheScope(
          operation.cacheHints?.scope ?? 'public',
          runtimeContext
        );
        if (ttlMs > 0 && effectiveScope !== 'none') {
          const now = this.clock.now().getTime();
          await this.cache.set(
            this.cacheKey(capability, candidate, request, runtimeContext, effectiveScope),
            {
              value: result,
              expiresAt: now + ttlMs,
              staleUntil: operation.cacheHints?.staleWhileRevalidateMs
                ? now + ttlMs + operation.cacheHints.staleWhileRevalidateMs
                : undefined,
              tags: [
                `plugin:${candidate.plugin.manifest.id}`,
                `domain:${candidate.domain}`,
                `capability:${capability}`,
                ...(runtimeContext.credential
                  ? [`credential:${runtimeContext.credential.id}`]
                  : []),
                ...(runtimeContext.session ? [`session:${runtimeContext.session.id}`] : []),
                ...(runtimeContext.networkRoute
                  ? [`network:${runtimeContext.networkRoute.id}`]
                  : []),
                ...(operation.cacheHints?.tags ?? [])
              ]
            }
          );
        }
        return result;
      } catch (error) {
        if (observedInvocationId && observedStartedAt !== undefined) {
          const failureCode =
            error instanceof SourceReaderError ? error.code : 'SOURCE_READER_INTERNAL_ERROR';
          if (circuitKey) {
            this.circuit.recordFailure(circuitKey, failureCode, this.clock.now().getTime());
          }
          this.observability.invocationFinished({
            requestId: request.requestId ?? 'untracked',
            invocationId: observedInvocationId,
            pluginId: candidate.plugin.manifest.id,
            capability,
            runtimeMode: candidate.executionMode,
            result: 'failed',
            durationMs: Math.max(0, this.clock.now().getTime() - observedStartedAt),
            failureCode
          });
        }
        if (invocationStartedAt !== undefined) {
          await this.recordHealthFailure(candidate, capability, invocationStartedAt, error);
        }
        lastError = error;
        if (!(error instanceof SourceReaderError) || !error.fallbackAllowed) throw error;
        this.observability.fallback({
          pluginId: candidate.plugin.manifest.id,
          capability,
          failureCode: error.code
        });
      } finally {
        leaveRateLimit?.();
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new SourceReaderError(
      'PLUGIN_UNAVAILABLE',
      `No available plugin completed ${capability}`,
      {
        retryable: true,
        fallbackAllowed: false
      }
    );
  }

  private async healthEligible(
    candidate: PluginCandidate,
    capability: Exclude<SourceCapability, 'authentication'>
  ): Promise<boolean> {
    try {
      return await this.health.isEligible(
        candidate.plugin.manifest.id,
        candidate.plugin.manifest.version,
        capability
      );
    } catch {
      return true;
    }
  }

  private async recordHealthSuccess(
    candidate: PluginCandidate,
    capability: Exclude<SourceCapability, 'authentication'>,
    startedAt: number
  ): Promise<void> {
    try {
      await this.health.recordSuccess({
        pluginId: candidate.plugin.manifest.id,
        pluginVersion: candidate.plugin.manifest.version,
        capability,
        durationMs: Math.max(0, this.clock.now().getTime() - startedAt)
      });
    } catch {
      // Health telemetry cannot turn a successful source read into a failure.
    }
  }

  private async recordHealthFailure(
    candidate: PluginCandidate,
    capability: Exclude<SourceCapability, 'authentication'>,
    startedAt: number,
    error: unknown
  ): Promise<void> {
    try {
      const failureCode =
        error instanceof SourceReaderError
          ? error.code
          : error instanceof Error
            ? error.name
            : 'UNKNOWN_PLUGIN_FAILURE';
      await this.health.recordFailure({
        pluginId: candidate.plugin.manifest.id,
        pluginVersion: candidate.plugin.manifest.version,
        capability,
        durationMs: Math.max(0, this.clock.now().getTime() - startedAt),
        failureCode
      });
      if (
        candidate.trustLevel !== 'built-in' &&
        failureCode === 'PLUGIN_PACKAGE_INVALID' &&
        this.health.quarantineIntegrityFailure
      ) {
        await this.health.quarantineIntegrityFailure({
          pluginId: candidate.plugin.manifest.id,
          pluginVersion: candidate.plugin.manifest.version,
          failureCode
        });
      }
    } catch {
      // Preserve the original plugin error and fallback policy.
    }
  }

  private decodeCursor(
    capability: Exclude<SourceCapability, 'authentication'>,
    token: string | undefined
  ): CursorPayload | undefined {
    if (!token) return undefined;
    if (!isPagedCapability(capability)) {
      throw new SourceReaderError('CURSOR_INVALID', 'This capability does not accept cursors', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    const payload = this.cursors.decode(token);
    if (payload.capability !== capability) {
      this.cursorInvalidated('Cursor capability no longer matches the request');
    }
    return payload;
  }

  private validateCursorBinding(
    payload: CursorPayload | undefined,
    capability: Exclude<SourceCapability, 'authentication'>,
    candidate: PluginCandidate,
    requestFingerprint: string
  ): void {
    if (!payload || !isPagedCapability(capability)) return;
    const contractVersion = candidate.plugin.manifest.contracts[capability] ?? 0;
    if (
      payload.pluginId !== candidate.plugin.manifest.id ||
      payload.pluginVersion !== candidate.plugin.manifest.version ||
      payload.contractVersion !== contractVersion ||
      payload.requestFingerprint !== requestFingerprint
    ) {
      this.cursorInvalidated('Cursor no longer matches the selected plugin or request');
    }
  }

  private pluginRequest(
    capability: Exclude<SourceCapability, 'authentication'>,
    request: ExecutableRequest,
    cursor: CursorPayload | undefined
  ): Record<string, unknown> {
    const pluginRequest: Record<string, unknown> = { ...request };
    if (isPagedCapability(capability)) {
      pluginRequest.cursor = cursor?.pluginCursor;
      pluginRequest.limit = MAX_LIMIT;
    }
    return pluginRequest;
  }

  private paginateResult(
    capability: PagedCapability,
    page: Page<unknown>,
    request: ExecutableRequest,
    candidate: PluginCandidate,
    requestFingerprint: string,
    cursor: CursorPayload | undefined
  ): Page<unknown> {
    const limit = this.limit(request.limit);
    const offset = cursor?.offset ?? 0;
    const items = page.items.slice(offset, offset + limit);
    const consumed = offset + items.length;

    let nextOffset: number | undefined;
    let nextPluginCursor: string | undefined;
    if (consumed < page.items.length) {
      nextOffset = consumed;
      nextPluginCursor = cursor?.pluginCursor;
    } else if (page.hasMore && page.nextCursor) {
      nextOffset = 0;
      nextPluginCursor = page.nextCursor;
    }

    let nextCursor: string | undefined;
    if (nextOffset !== undefined) {
      nextCursor = this.cursors.encode({
        pluginId: candidate.plugin.manifest.id,
        pluginVersion: candidate.plugin.manifest.version,
        capability,
        contractVersion: candidate.plugin.manifest.contracts[capability] ?? 0,
        requestFingerprint,
        pluginCursor: nextPluginCursor,
        offset: nextOffset,
        expiresAt: this.clock.now().getTime() + CURSOR_TTL_MS
      });
    }

    return { items, nextCursor, hasMore: nextCursor !== undefined };
  }

  private cacheLookupScopes(runtime: ResolvedRuntimeContext): CacheScope[] {
    const scopes: CacheScope[] = [];
    if (runtime.cacheIdentity.session) scopes.push('session');
    if (runtime.cacheIdentity.account) scopes.push('account');
    if (runtime.cacheIdentity.user) scopes.push('user');
    return scopes.length > 0 ? scopes : ['public'];
  }

  private cacheKey(
    capability: Exclude<SourceCapability, 'authentication'>,
    candidate: PluginCandidate,
    request: ExecutableRequest,
    runtime: ResolvedRuntimeContext,
    scope: CacheScope
  ): string {
    if (scope === 'none') {
      throw new SourceReaderError(
        'CACHE_SCOPE_IDENTITY_MISSING',
        'A cache key cannot be created for none scope',
        { retryable: false, fallbackAllowed: false }
      );
    }
    const extensionContractVersions = Object.fromEntries(
      Object.entries(candidate.plugin.manifest.extensionContracts ?? {}).map(
        ([namespace, value]) => [namespace, String(value.version)]
      )
    );
    return `source-reader:${buildSourceReaderCacheKey({
      pluginId: candidate.plugin.manifest.id,
      pluginVersion: candidate.plugin.manifest.version,
      capability,
      contractVersion: String(candidate.plugin.manifest.contracts[capability] ?? 0),
      extensionContractVersions,
      normalizedRequestFingerprint: this.fingerprint({
        normalizedUrl: candidate.normalizedUrl,
        requestParameters: this.cacheableRequest(request)
      }),
      networkIdentity: runtime.cacheIdentity.network,
      scope,
      scopeIdentity: resolveCacheScopeIdentity(runtime.cacheIdentity, scope)
    })}`;
  }

  private cacheableRequest(request: ExecutableRequest): Record<string, unknown> {
    return {
      cursor: request.cursor,
      limit: request.limit,
      query: request.query
    };
  }

  private narrowCacheScope(requested: CacheScope, runtime: ResolvedRuntimeContext): CacheScope {
    if (requested === 'none') return 'none';
    if (requested === 'public') {
      if (runtime.cacheIdentity.session) return 'session';
      if (runtime.cacheIdentity.account) return 'account';
      if (runtime.cacheIdentity.user) return 'user';
      return 'public';
    }
    return runtime.cacheIdentity[requested] ? requested : 'none';
  }

  private requestFingerprint(
    capability: Exclude<SourceCapability, 'authentication'>,
    normalizedUrl: string,
    request: ExecutableRequest
  ): string {
    return this.fingerprint({
      capability,
      url: normalizedUrl,
      query: capability === 'search' ? request.query : undefined
    });
  }

  private cursorInvalidated(message: string): never {
    throw new SourceReaderError('CURSOR_INVALIDATED', message, {
      retryable: false,
      fallbackAllowed: false
    });
  }

  private async hasAnyCandidate(url: string): Promise<boolean> {
    for (const capability of DISCOVERABLE_CAPABILITIES) {
      if ((await this.registry.listCandidates({ url, capability })).length > 0) return true;
    }
    return false;
  }

  private limit(value: unknown): number {
    const numeric = typeof value === 'number' ? Math.floor(value) : DEFAULT_LIMIT;
    return Math.max(1, Math.min(numeric, MAX_LIMIT));
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
