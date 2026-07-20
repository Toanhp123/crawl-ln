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
