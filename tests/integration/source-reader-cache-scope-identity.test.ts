import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSourceReaderCacheKey,
  type SourceReaderCacheIdentity
} from '../../apps/api-legacy/src/modules/source-reader/application/services/source-reader-cache-key.ts';
import { SourceReaderError } from '../../apps/api-legacy/src/modules/source-reader/domain/errors/source-reader.error.ts';

const base: Omit<SourceReaderCacheIdentity, 'scope' | 'scopeIdentity'> = {
  pluginId: 'demo',
  pluginVersion: '1.0.0',
  capability: 'metadata',
  contractVersion: '1',
  extensionContractVersions: { premium: '2', ratings: '1' },
  normalizedRequestFingerprint: 'request-a',
  networkIdentity: 'direct'
};

function key(
  scope: SourceReaderCacheIdentity['scope'],
  scopeIdentity: string,
  overrides: Partial<SourceReaderCacheIdentity> = {}
): string {
  return buildSourceReaderCacheKey({ ...base, scope, scopeIdentity, ...overrides });
}

test('public cache keys are shared while account, user, and session keys use distinct identities', () => {
  assert.equal(key('public', 'public'), key('public', 'public'));
  assert.notEqual(key('account', 'credential-a'), key('account', 'credential-b'));
  assert.notEqual(key('user', 'user-a'), key('user', 'user-b'));
  assert.notEqual(key('session', 'session-a'), key('session', 'session-b'));

  assert.notEqual(key('account', 'shared-credential'), key('user', 'shared-credential'));
  assert.notEqual(key('user', 'same-system-credential'), key('user', 'other-user'));
});

test('cache key binds plugin, contracts, request fingerprint, and route identity', () => {
  const original = key('public', 'public');
  const variants = [
    key('public', 'public', { pluginVersion: '2.0.0' }),
    key('public', 'public', { contractVersion: '2' }),
    key('public', 'public', { extensionContractVersions: { premium: '3', ratings: '1' } }),
    key('public', 'public', { normalizedRequestFingerprint: 'request-b' }),
    key('public', 'public', { networkIdentity: 'http-proxy:route-a' })
  ];

  for (const variant of variants) assert.notEqual(variant, original);
  assert.equal(
    key('public', 'public', { extensionContractVersions: { ratings: '1', premium: '2' } }),
    original
  );
});

test('private cache scopes reject missing identities', () => {
  for (const scope of ['account', 'user', 'session'] as const) {
    assert.throws(
      () => key(scope, ''),
      (error: unknown) =>
        error instanceof SourceReaderError && error.code === 'CACHE_SCOPE_IDENTITY_MISSING'
    );
  }
});
