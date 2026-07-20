import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNetworkProfileUpdate,
  canSubmitNetworkProfile,
  type NetworkProfileFormState
} from '../../apps/web/src/features/manage-source-network-profile/model/networkProfileForm.ts';
import {
  buildCredentialSecret,
  createEmptyCredentialSecrets,
  hasCredentialSecret
} from '../../apps/web/src/features/manage-source-credential/model/credentialSecret.ts';

const proxyForm = (overrides: Partial<NetworkProfileFormState> = {}): NetworkProfileFormState => ({
  name: 'Primary proxy',
  ownerType: 'user',
  routeType: 'http-proxy',
  regions: 'US',
  tags: 'premium',
  proxyUrl: '',
  proxyUsername: '',
  proxyPassword: '',
  ...overrides
});

test('editing proxy metadata preserves write-only proxy config unless replacement values are supplied', () => {
  const form = proxyForm({ name: 'Renamed proxy' });
  assert.equal(canSubmitNetworkProfile(form, 'http-proxy'), true);
  assert.deepEqual(buildNetworkProfileUpdate(form, 'http-proxy'), {
    name: 'Renamed proxy',
    routeType: 'http-proxy',
    regions: ['US'],
    tags: ['premium']
  });
});

test('switching route types clears or replaces encrypted proxy config intentionally', () => {
  assert.deepEqual(buildNetworkProfileUpdate(proxyForm({ routeType: 'direct' }), 'http-proxy'), {
    name: 'Primary proxy',
    routeType: 'direct',
    regions: ['US'],
    tags: ['premium'],
    config: {}
  });
  assert.equal(
    canSubmitNetworkProfile(proxyForm({ routeType: 'https-proxy' }), 'http-proxy'),
    false
  );
  assert.equal(
    canSubmitNetworkProfile(
      proxyForm({ routeType: 'https-proxy', proxyUrl: 'http://proxy.example:8080' }),
      'http-proxy'
    ),
    false
  );
  assert.equal(
    canSubmitNetworkProfile(
      proxyForm({ routeType: 'socks-proxy', proxyUrl: 'socks5://proxy.example' }),
      'http-proxy'
    ),
    false
  );
  assert.deepEqual(
    buildNetworkProfileUpdate(
      proxyForm({ routeType: 'https-proxy', proxyUrl: 'https://proxy.example:443' }),
      'http-proxy'
    ).config,
    { endpoint: 'https://proxy.example:443' }
  );
});

test('credential forms require the secret fields needed by each strategy', () => {
  const empty = createEmptyCredentialSecrets();
  assert.equal(hasCredentialSecret('cookie-import', empty), false);
  assert.equal(hasCredentialSecret('basic-auth', { ...empty, username: 'reader' }), false);
  const basic = { ...empty, username: 'reader', password: 'secret' };
  assert.equal(hasCredentialSecret('basic-auth', basic), true);
  assert.deepEqual(buildCredentialSecret('basic-auth', basic), {
    username: 'reader',
    password: 'secret'
  });
});

test('network edit form resets from current metadata without hydrating write-only proxy values', async () => {
  const model =
    await import('../../apps/web/src/features/manage-source-network-profile/model/networkProfileForm.ts');
  assert.equal(typeof model.networkProfileFormFromProfile, 'function');
  const form = model.networkProfileFormFromProfile({
    id: 'network-1',
    ownerType: 'user',
    ownerId: 'user-1',
    name: 'Current proxy',
    routeType: 'https-proxy',
    regions: ['EU', 'US'],
    tags: ['premium'],
    healthStatus: 'healthy',
    enabled: true,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T01:00:00.000Z'
  });
  assert.deepEqual(form, {
    name: 'Current proxy',
    ownerType: 'user',
    routeType: 'https-proxy',
    regions: 'EU, US',
    tags: 'premium',
    proxyUrl: '',
    proxyUsername: '',
    proxyPassword: ''
  });
});

test('credential create model builds a trimmed request and resets all fields', async () => {
  const model =
    await import('../../apps/web/src/features/manage-source-credential/model/credentialForm.ts');
  assert.equal(typeof model.createEmptyCredentialForm, 'function');
  assert.equal(typeof model.buildCredentialCreateRequest, 'function');
  assert.deepEqual(model.createEmptyCredentialForm(), {
    ownerType: 'user',
    strategy: 'cookie-import',
    name: '',
    pluginId: '',
    domain: '',
    secrets: createEmptyCredentialSecrets()
  });
  assert.deepEqual(
    model.buildCredentialCreateRequest({
      ownerType: 'system',
      strategy: 'bearer-token',
      name: '  Premium  ',
      pluginId: ' demo ',
      domain: ' example.com ',
      secrets: { ...createEmptyCredentialSecrets(), token: ' token ' }
    }),
    {
      ownerType: 'system',
      strategy: 'bearer-token',
      name: 'Premium',
      pluginId: 'demo',
      domain: 'example.com',
      secret: { token: 'token' }
    }
  );
});
