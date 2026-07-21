import { createHash } from 'node:crypto';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { CacheScope, SourceReaderResult } from '../../public/source-reader.models.js';
import type {
  ExecutableSourceCapability,
  SourceReaderCacheEntry,
  SourceReaderCachePort,
  SourceReaderCandidate,
  SourceReaderExecutableRequest,
  SourceReaderRefreshPort,
  SourceReaderRuntimeContext
} from '../source-reader.ports.js';

interface CacheInput {
  capability: ExecutableSourceCapability;
  candidate: SourceReaderCandidate;
  context: SourceReaderRuntimeContext;
  request: SourceReaderExecutableRequest;
}

const noRefresh: SourceReaderRefreshPort = { schedule() {} };

export class ReaderCachePolicy {
  constructor(
    private readonly cache: SourceReaderCachePort,
    private readonly clock: { now(): Date },
    private readonly refresh: SourceReaderRefreshPort = noRefresh
  ) {}

  async lookup<T>(
    input: CacheInput,
    refresh?: () => Promise<unknown>
  ): Promise<SourceReaderResult<T> | undefined> {
    if (input.request.freshOnly) return undefined;
    for (const scope of this.lookupScopes(input.context)) {
      const key = this.key(input, scope);
      const cached = await this.cache.get<SourceReaderResult<T>>(key);
      const now = this.clock.now().getTime();
      if (cached && cached.expiresAt > now) return cached.value;
      if (
        cached &&
        scope === 'public' &&
        cached.staleUntil !== undefined &&
        cached.staleUntil > now
      ) {
        if (refresh) this.refresh.schedule(key, refresh);
        return {
          ...cached.value,
          warnings: [
            ...(cached.value.warnings ?? []),
            { code: 'STALE_CACHE_USED', message: 'A stale public cache entry was used' }
          ]
        };
      }
    }
    return undefined;
  }

  async store<T>(
    input: CacheInput & {
      result: SourceReaderResult<T>;
      cacheHints?: {
        scope?: CacheScope;
        ttlMs?: number;
        staleWhileRevalidateMs?: number;
        tags?: string[];
      };
    }
  ): Promise<void> {
    const ttlMs = Math.max(0, Math.min(input.cacheHints?.ttlMs ?? 0, 30 * 24 * 60 * 60_000));
    const scope = this.narrowScope(input.cacheHints?.scope ?? 'public', input.context);
    if (ttlMs === 0 || scope === 'none') return;
    const now = this.clock.now().getTime();
    const tags = [
      `plugin:${input.candidate.pluginId}`,
      `plugin-version:${input.candidate.pluginId}@${input.candidate.pluginVersion}`,
      `domain:${input.candidate.domain}`,
      `capability:${input.capability}`,
      `network:${input.context.cacheIdentity.network}`,
      ...(input.cacheHints?.tags ?? [])
    ];
    const entry: SourceReaderCacheEntry<SourceReaderResult<T>> = {
      value: input.result,
      expiresAt: now + ttlMs,
      ...(scope === 'public' && input.cacheHints?.staleWhileRevalidateMs
        ? { staleUntil: now + ttlMs + input.cacheHints.staleWhileRevalidateMs }
        : {}),
      metadata: { scope, tags }
    };
    await this.cache.set(this.key(input, scope), entry);
  }

  private lookupScopes(context: SourceReaderRuntimeContext): Array<Exclude<CacheScope, 'none'>> {
    const scopes: Array<Exclude<CacheScope, 'none'>> = [];
    if (context.cacheIdentity.session) scopes.push('session');
    if (context.cacheIdentity.account) scopes.push('account');
    if (context.cacheIdentity.user) scopes.push('user');
    return scopes.length > 0 ? scopes : ['public'];
  }

  private narrowScope(scope: CacheScope, context: SourceReaderRuntimeContext): CacheScope {
    if (scope === 'none') return 'none';
    if (scope === 'public') {
      if (context.cacheIdentity.session) return 'session';
      if (context.cacheIdentity.account) return 'account';
      if (context.cacheIdentity.user) return 'user';
      return 'public';
    }
    return context.cacheIdentity[scope] ? scope : 'none';
  }

  private key(input: CacheInput, scope: Exclude<CacheScope, 'none'>): string {
    const scopeIdentity =
      scope === 'public' ? input.context.cacheIdentity.public : input.context.cacheIdentity[scope];
    if (!scopeIdentity) {
      throw new SourceReaderError(
        'CACHE_SCOPE_IDENTITY_MISSING',
        `Cache identity is unavailable for ${scope} scope`,
        { retryable: false, fallbackAllowed: false, details: { scope } }
      );
    }
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          pluginId: input.candidate.pluginId,
          pluginVersion: input.candidate.pluginVersion,
          capability: input.capability,
          contractVersion: input.candidate.contractVersion,
          extensionContractVersions: Object.entries(
            input.candidate.extensionContractVersions ?? {}
          ).sort(([left], [right]) => left.localeCompare(right)),
          normalizedUrl: input.candidate.normalizedUrl,
          request: {
            cursor: input.request.cursor,
            limit: input.request.limit,
            query: input.request.query
          },
          network: input.context.cacheIdentity.network,
          scope,
          scopeIdentity
        })
      )
      .digest('hex');
    return `source-reader:${fingerprint}`;
  }
}
