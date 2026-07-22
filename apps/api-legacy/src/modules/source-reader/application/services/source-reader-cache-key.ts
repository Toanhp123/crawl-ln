import { createHash } from 'node:crypto';
import type { SourceCapability } from '../../public/source-reader.models.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

export type SourceReaderPrivateCacheScope = 'account' | 'user' | 'session';
export type SourceReaderCacheScope = 'public' | SourceReaderPrivateCacheScope;

export interface ResolvedCacheIdentity {
  public: 'public';
  account?: string;
  user?: string;
  session?: string;
  network: string;
}

export interface SourceReaderCacheIdentity {
  pluginId: string;
  pluginVersion: string;
  capability: SourceCapability;
  contractVersion: string;
  extensionContractVersions: Record<string, string>;
  normalizedRequestFingerprint: string;
  networkIdentity: string;
  scope: SourceReaderCacheScope;
  scopeIdentity: string;
}

export function resolveCacheScopeIdentity(
  identities: ResolvedCacheIdentity,
  scope: SourceReaderCacheScope
): string {
  const identity = scope === 'public' ? identities.public : identities[scope];
  if (!identity) {
    throw new SourceReaderError(
      'CACHE_SCOPE_IDENTITY_MISSING',
      `Cache identity is unavailable for ${scope} scope`,
      {
        retryable: false,
        fallbackAllowed: false,
        details: { scope }
      }
    );
  }
  return identity;
}

export function buildSourceReaderCacheKey(identity: SourceReaderCacheIdentity): string {
  if (identity.scope !== 'public' && !identity.scopeIdentity) {
    throw new SourceReaderError(
      'CACHE_SCOPE_IDENTITY_MISSING',
      `Cache identity is unavailable for ${identity.scope} scope`,
      {
        retryable: false,
        fallbackAllowed: false,
        details: { scope: identity.scope }
      }
    );
  }
  const extensions = Object.entries(identity.extensionContractVersions).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return createHash('sha256')
    .update(JSON.stringify({ ...identity, extensionContractVersions: extensions }))
    .digest('hex');
}
