import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { apiRuntime } from './api-next.runtime.ts';
import { currentApiRuntime } from './current-api.runtime.ts';
import { withContractServer } from './http-server.harness.ts';

const storageRoot = await mkdtemp(join(tmpdir(), 'source-reader-http-contract-'));
process.env.STORAGE_DIR = join(storageRoot, 'current');
process.env.STORAGE_DIR = join(storageRoot, 'next');
process.env.SOURCE_READER_LOCAL_ADMIN = 'true';
process.env.SOURCE_READER_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.SOURCE_READER_NETWORK_DIAGNOSTIC_URL = 'http://127.0.0.1:1/diagnostic';
process.env.REQUEST_TIMEOUT_MS = '100';

test.after(() => rm(storageRoot, { recursive: true, force: true }));

interface ErrorEnvelope {
  data: null;
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

interface SuccessEnvelope<T> {
  data: T;
  error: null;
}

const actorHeaders = {
  'x-source-reader-user-id': 'contract-user',
  'x-request-id': 'source-reader-contract-request'
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function pluginPackage(): Promise<Uint8Array> {
  const manifest = Buffer.from(
    JSON.stringify({
      id: 'contract-plugin',
      name: 'Contract Plugin',
      version: '1.0.0',
      engines: { sourceReader: '>=2.9.6 <3' },
      capabilities: ['metadata'],
      contracts: { metadata: 1 },
      matchers: [{ hosts: ['contract.example'], priority: 100 }],
      runtime: { preferredMode: 'isolated' },
      permissions: { network: { hosts: ['contract.example'] } }
    })
  );
  const entry = Buffer.from('export default {};');
  const zip = new JSZip();
  zip.file('manifest.json', manifest);
  zip.file('dist/index.js', entry);
  zip.file(
    'checksums.json',
    JSON.stringify({
      'manifest.json': sha256(manifest),
      'dist/index.js': sha256(entry)
    })
  );
  return zip.generateAsync({ type: 'uint8array' });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function assertSourceReaderError(
  response: Response,
  status: number,
  code: string
): Promise<ErrorEnvelope> {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('x-request-id'), actorHeaders['x-request-id']);
  const body = await json<ErrorEnvelope>(response);
  assert.equal(body.data, null);
  assert.equal(body.error.code, code);
  assert.equal(JSON.stringify(body).includes(storageRoot), false);
  assert.equal(JSON.stringify(body).includes('encrypted_'), false);
  return body;
}

async function postJson(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/source-reader${path}`, {
    method: 'POST',
    headers: { ...actorHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function assertReaderRoutes(baseUrl: string): Promise<void> {
  const unsupportedUrl = 'https://unsupported.example/book';
  const requests: Array<[string, Record<string, unknown>]> = [
    ['/identify', { url: unsupportedUrl }],
    ['/metadata', { url: unsupportedUrl }],
    ['/chapter-list', { url: unsupportedUrl, limit: 10 }],
    ['/chapter-content', { url: unsupportedUrl }],
    ['/search', { url: unsupportedUrl, query: 'contract', limit: 10 }],
    ['/latest-updates', { url: unsupportedUrl, limit: 10 }]
  ];

  for (const [path, body] of requests) {
    const error = await assertSourceReaderError(
      await postJson(baseUrl, path, body),
      422,
      'SOURCE_NOT_SUPPORTED'
    );
    assert.deepEqual(error.error.details, {
      retryable: false,
      requestId: actorHeaders['x-request-id']
    });
  }
}

async function assertPluginAdministration(baseUrl: string): Promise<void> {
  const initial = await fetch(`${baseUrl}/api/source-reader/plugins`, { headers: actorHeaders });
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get('x-request-id'), actorHeaders['x-request-id']);
  assert.deepEqual((await json<SuccessEnvelope<unknown[]>>(initial)).error, null);

  const missingPackage = await postJson(baseUrl, '/plugins/install', {});
  await assertSourceReaderError(missingPackage, 422, 'PLUGIN_RESULT_INVALID');

  const form = new FormData();
  form.set(
    'plugin',
    new Blob([await pluginPackage()], { type: 'application/octet-stream' }),
    'contract-plugin.source-plugin'
  );
  const installed = await fetch(`${baseUrl}/api/source-reader/plugins/install`, {
    method: 'POST',
    headers: actorHeaders,
    body: form
  });
  assert.equal(installed.status, 202);
  const installedBody = await json<
    SuccessEnvelope<{
      installationId: string;
      pluginId: string;
      version: string;
      status: string;
    }>
  >(installed);
  assert.equal(installedBody.data.pluginId, 'contract-plugin');
  assert.equal(installedBody.data.version, '1.0.0');
  assert.equal(installedBody.data.status, 'pending-approval');
  assert.equal(JSON.stringify(installedBody).includes('packagePath'), false);

  const listed = await fetch(`${baseUrl}/api/source-reader/plugins`, { headers: actorHeaders });
  const listedBody = await json<SuccessEnvelope<Array<Record<string, unknown>>>>(listed);
  assert.equal(listed.status, 200);
  assert.equal(
    listedBody.data.some((plugin) => plugin.pluginId === 'contract-plugin'),
    true
  );
  assert.equal(JSON.stringify(listedBody).includes('packagePath'), false);
  assert.equal(JSON.stringify(listedBody).includes('checksum'), false);

  const permissions = await fetch(
    `${baseUrl}/api/source-reader/plugins/contract-plugin/permissions`,
    { headers: actorHeaders }
  );
  const permissionsBody = await json<SuccessEnvelope<Array<{ status: string }>>>(permissions);
  assert.equal(permissions.status, 200);
  assert.equal(permissionsBody.data[0]?.status, 'pending');

  const approved = await postJson(baseUrl, '/plugins/contract-plugin/permissions/approve', {
    version: '1.0.0'
  });
  assert.equal(approved.status, 204);
  assert.equal(await approved.text(), '');

  const diagnostics = await fetch(`${baseUrl}/api/source-reader/plugins/contract-plugin`, {
    headers: actorHeaders
  });
  const diagnosticsBody = await json<SuccessEnvelope<Record<string, unknown>>>(diagnostics);
  assert.equal(diagnostics.status, 200);
  assert.equal(diagnosticsBody.data.pluginId, 'contract-plugin');
  assert.equal(diagnosticsBody.data.status, 'pending-approval');
  assert.equal(JSON.stringify(diagnosticsBody).includes('packagePath'), false);

  const health = await fetch(`${baseUrl}/api/source-reader/plugins/contract-plugin/health`, {
    headers: actorHeaders
  });
  assert.equal(health.status, 200);
  assert.equal(
    (await json<SuccessEnvelope<{ pluginId: string }>>(health)).data.pluginId,
    'contract-plugin'
  );

  const denied = await postJson(baseUrl, '/plugins/contract-plugin/permissions/deny', {
    version: '1.0.0'
  });
  assert.equal(denied.status, 204);

  const oversized = new FormData();
  oversized.set(
    'plugin',
    new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]),
    'oversized.source-plugin'
  );
  const oversizedResponse = await fetch(`${baseUrl}/api/source-reader/plugins/install`, {
    method: 'POST',
    headers: actorHeaders,
    body: oversized
  });
  assert.equal(oversizedResponse.status, 500);
  assert.deepEqual(await json<ErrorEnvelope>(oversizedResponse), {
    data: null,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: null }
  });
}

async function assertPluginRemoval(baseUrl: string): Promise<void> {
  const removed = await fetch(`${baseUrl}/api/source-reader/plugins/contract-plugin`, {
    method: 'DELETE',
    headers: actorHeaders
  });
  assert.equal(removed.status, 204);

  await assertSourceReaderError(
    await fetch(`${baseUrl}/api/source-reader/plugins/contract-plugin`, {
      headers: actorHeaders
    }),
    503,
    'PLUGIN_UNAVAILABLE'
  );
}

async function assertCredentialAdministration(baseUrl: string): Promise<void> {
  const created = await postJson(baseUrl, '/credentials', {
    ownerType: 'user',
    pluginId: 'contract-plugin',
    domain: 'contract.example',
    name: 'Contract credential',
    strategy: 'bearer-token',
    secret: { token: 'top-secret' }
  });
  assert.equal(created.status, 202);
  const createdBody = await json<SuccessEnvelope<{ id: string; ownerId?: string }>>(created);
  const credentialId = createdBody.data.id;
  assert.equal(createdBody.data.ownerId, 'contract-user');
  assert.equal(JSON.stringify(createdBody).includes('top-secret'), false);

  const listed = await fetch(`${baseUrl}/api/source-reader/credentials`, {
    headers: actorHeaders
  });
  const listedBody = await json<SuccessEnvelope<Array<{ id: string }>>>(listed);
  assert.equal(listed.status, 200);
  assert.equal(
    listedBody.data.some((item) => item.id === credentialId),
    true
  );
  assert.equal(JSON.stringify(listedBody).includes('top-secret'), false);

  const updated = await fetch(`${baseUrl}/api/source-reader/credentials/${credentialId}`, {
    method: 'PATCH',
    headers: { ...actorHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ secret: { token: 'rotated-secret' } })
  });
  assert.equal(updated.status, 204);

  await assertSourceReaderError(
    await postJson(baseUrl, `/credentials/${credentialId}/login`, {}),
    503,
    'PLUGIN_UNAVAILABLE'
  );
  await assertSourceReaderError(
    await postJson(baseUrl, `/credentials/${credentialId}/test`, {}),
    503,
    'PLUGIN_UNAVAILABLE'
  );

  const loggedOut = await postJson(baseUrl, `/credentials/${credentialId}/logout`, {});
  assert.equal(loggedOut.status, 204);

  const removed = await fetch(`${baseUrl}/api/source-reader/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: actorHeaders
  });
  assert.equal(removed.status, 204);
}

async function assertNetworkAndChallengeAdministration(baseUrl: string): Promise<void> {
  const created = await postJson(baseUrl, '/network-profiles', {
    ownerType: 'user',
    name: 'Contract route',
    routeType: 'direct',
    regions: ['test'],
    tags: ['contract'],
    config: { password: 'route-secret' }
  });
  assert.equal(created.status, 202);
  const createdBody = await json<SuccessEnvelope<{ id: string }>>(created);
  const profileId = createdBody.data.id;
  assert.equal(JSON.stringify(createdBody).includes('route-secret'), false);

  const listed = await fetch(`${baseUrl}/api/source-reader/network-profiles`, {
    headers: actorHeaders
  });
  const listedBody = await json<SuccessEnvelope<Array<{ id: string }>>>(listed);
  assert.equal(listed.status, 200);
  assert.equal(
    listedBody.data.some((item) => item.id === profileId),
    true
  );
  assert.equal(JSON.stringify(listedBody).includes('route-secret'), false);

  const updated = await fetch(`${baseUrl}/api/source-reader/network-profiles/${profileId}`, {
    method: 'PATCH',
    headers: { ...actorHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Updated route' })
  });
  assert.equal(updated.status, 204);

  await assertSourceReaderError(
    await postJson(baseUrl, `/network-profiles/${profileId}/test`, {}),
    502,
    'NETWORK_ROUTE_TEST_FAILED'
  );

  const removed = await fetch(`${baseUrl}/api/source-reader/network-profiles/${profileId}`, {
    method: 'DELETE',
    headers: actorHeaders
  });
  assert.equal(removed.status, 204);

  const challenges = await fetch(`${baseUrl}/api/source-reader/auth/challenges`, {
    headers: actorHeaders
  });
  assert.equal(challenges.status, 200);
  assert.deepEqual((await json<SuccessEnvelope<unknown[]>>(challenges)).data, []);

  await assertSourceReaderError(
    await fetch(`${baseUrl}/api/source-reader/auth/challenges/missing`, {
      headers: actorHeaders
    }),
    409,
    'AUTH_CHALLENGE_EXPIRED'
  );
  await assertSourceReaderError(
    await postJson(baseUrl, '/auth/challenges/missing/respond', {
      response: { type: 'otp', code: '123456' }
    }),
    409,
    'AUTH_CHALLENGE_EXPIRED'
  );
  await assertSourceReaderError(
    await postJson(baseUrl, '/auth/challenges/missing/cancel', {}),
    409,
    'AUTH_CHALLENGE_EXPIRED'
  );
}

async function assertSourceReaderHttpContract(baseUrl: string): Promise<void> {
  await assertReaderRoutes(baseUrl);
  await assertPluginAdministration(baseUrl);
  await assertCredentialAdministration(baseUrl);
  await assertNetworkAndChallengeAdministration(baseUrl);
  await assertPluginRemoval(baseUrl);
}

for (const [name, runtime] of [
  ['current', currentApiRuntime],
  ['next', apiRuntime]
] as const) {
  test(`${name} API preserves the Source Reader HTTP contract`, async () => {
    await withContractServer(runtime, assertSourceReaderHttpContract);
  });
}
