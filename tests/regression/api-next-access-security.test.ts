import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvironment } from '../../apps/api-next/src/platform/config/environment.ts';

test('api-next rejects unsafe non-loopback binding and validates CORS origins', () => {
  const local = createEnvironment({});
  assert.equal(local.host, '127.0.0.1');
  assert.deepEqual(local.apiCorsOrigins, ['http://127.0.0.1:5173', 'http://localhost:5173']);
  assert.equal(local.apiRemoteToken, undefined);

  assert.throws(
    () => createEnvironment({ NEXT_API_HOST: '0.0.0.0' }),
    /API_REMOTE_TOKEN.*32 characters/i
  );
  assert.throws(
    () => createEnvironment({ NEXT_API_HOST: '0.0.0.0', API_REMOTE_TOKEN: 'too-short' }),
    /API_REMOTE_TOKEN.*32 characters/i
  );
  assert.throws(() => createEnvironment({ API_CORS_ORIGINS: '' }), /must not be empty/i);
  assert.throws(() => createEnvironment({ API_CORS_ORIGINS: '*' }), /wildcard/i);

  const remote = createEnvironment({
    NEXT_API_HOST: '0.0.0.0',
    API_REMOTE_TOKEN: 'x'.repeat(32),
    API_CORS_ORIGINS: 'https://novel-tool.example'
  });
  assert.equal(remote.host, '0.0.0.0');
  assert.equal(remote.apiRemoteToken, 'x'.repeat(32));
  assert.deepEqual(remote.apiCorsOrigins, ['https://novel-tool.example']);
});
