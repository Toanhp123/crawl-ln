import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path: string) {
  return readFile(path, 'utf8');
}

test('shared exports complete Source Reader browser contracts and multipart transport', async () => {
  const shared = await source('packages/shared/src/index.ts');
  for (const name of [
    'SourceReaderCredentialMetadata',
    'SourceReaderNetworkProfileMetadata',
    'SourceReaderAuthChallenge',
    'SourceReaderPluginPermission',
    'SourceReaderInspectOperation',
    'SourceReaderResult'
  ]) {
    assert.match(shared, new RegExp(`export (?:type|interface) ${name}`));
  }

  const http = await source('apps/web-legacy/src/shared/api/http.ts');
  assert.match(http, /export async function httpFormData/);
});

test('web console references every Source Reader HTTP route', async () => {
  const files = [
    'apps/web-legacy/src/entities/source-plugin/api/sourcePluginApi.ts',
    'apps/web-legacy/src/entities/source-credential/api/sourceCredentialApi.ts',
    'apps/web-legacy/src/entities/source-network-profile/api/sourceNetworkProfileApi.ts',
    'apps/web-legacy/src/entities/source-auth-challenge/api/sourceAuthChallengeApi.ts',
    'apps/web-legacy/src/features/inspect-source-url/api/sourceReaderInspectionApi.ts'
  ];
  const combined = (await Promise.all(files.map(source))).join('\n');
  for (const route of [
    '/api/source-reader/identify',
    '/api/source-reader/metadata',
    '/api/source-reader/chapter-list',
    '/api/source-reader/chapter-content',
    '/api/source-reader/search',
    '/api/source-reader/latest-updates',
    '/api/source-reader/plugins',
    '/install',
    '/enable',
    '/disable',
    '/test',
    '/health',
    '/permissions',
    '/api/source-reader/credentials',
    '/login',
    '/logout',
    '/api/source-reader/network-profiles',
    '/api/source-reader/auth/challenges',
    '/respond',
    '/cancel'
  ])
    assert.match(combined, new RegExp(route.replaceAll('/', '\\/')));
});

test('Source Reader secrets and administration queries stay out of persisted query cache', async () => {
  const persistence = await source('apps/web-legacy/src/shared/api/queryPersistence.ts');
  assert.doesNotMatch(persistence, /source-reader/);

  const credentials = await source(
    'apps/web-legacy/src/features/manage-source-credential/ui/ReplaceSourceCredentialSecretButton.tsx'
  );
  const networks = await source(
    'apps/web-legacy/src/features/manage-source-network-profile/ui/EditSourceNetworkProfileButton.tsx'
  );
  assert.match(credentials, /onSettled:\s*reset/);
  assert.match(networks, /networkProfileFormFromProfile\(profile\)/);
  assert.match(networks, /proxyPassword: ''|networkProfileFormFromProfile/);
});
