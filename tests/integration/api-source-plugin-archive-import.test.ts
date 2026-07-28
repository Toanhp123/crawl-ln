import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { createAppRuntime } from '../../apps/api/src/app.ts';
import { createEnvironment } from '../../apps/api/src/platform/config/environment.ts';

interface ApiBody<T = unknown> {
  data: T;
  error: { code: string; message: string } | null;
}

function pluginManifest(id: string, permissionHosts = [`${id}.example`]) {
  return {
    id,
    name: `Archive ${id}`,
    version: '1.0.0',
    engines: { sourceReader: '^1.0.0' },
    capabilities: ['identify'],
    contracts: { identify: 1 },
    matchers: [{ hosts: [`${id}.example`], include: ['/**'], priority: 100 }],
    runtime: { preferredMode: 'isolated' },
    permissions: { network: { hosts: permissionHosts } }
  };
}

async function sourceArchive(id: string, permissionHosts = [`${id}.example`]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(pluginManifest(id, permissionHosts)));
  zip.file('src/index.ts', 'export default {}');
  zip.file('tests/smoke.test.ts', 'export {}');
  return zip.generateAsync({ type: 'uint8array', platform: 'UNIX', compression: 'DEFLATE' });
}

async function builtArchive(id: string): Promise<Uint8Array> {
  const files = {
    'manifest.json': JSON.stringify(pluginManifest(id)),
    'dist/index.js': 'export default {}'
  };
  const checksums = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [
      path,
      createHash('sha256').update(content).digest('hex')
    ])
  );
  const zip = new JSZip();
  for (const [path, content] of Object.entries({
    ...files,
    'checksums.json': JSON.stringify(checksums)
  })) {
    zip.file(path, content, { unixPermissions: 0o100644, createFolders: false });
  }
  return zip.generateAsync({ type: 'uint8array', platform: 'UNIX', compression: 'DEFLATE' });
}

async function readBody<T>(response: Response): Promise<ApiBody<T>> {
  return (await response.json()) as ApiBody<T>;
}

async function postArchive(
  baseUrl: string,
  path: string,
  bytes: Uint8Array,
  fields: Record<string, string> = {},
  fileName = 'plugin.zip'
): Promise<Response> {
  const form = new FormData();
  form.append('plugin', new Blob([bytes], { type: 'application/zip' }), fileName);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return fetch(`${baseUrl}${path}`, { method: 'POST', body: form });
}

test('source plugin archive HTTP workflows keep install and project import side effects separate', async (t) => {
  const storageDirectory = await mkdtemp(join(tmpdir(), 'source-plugin-archive-http-'));
  const runtime = createAppRuntime({
    environment: createEnvironment({
      ...process.env,
      STORAGE_DIR: storageDirectory,
      SOURCE_READER_PLUGIN_DIR: join(storageDirectory, 'source-plugins'),
      SOURCE_READER_LOCAL_ADMIN: 'true'
    })
  });
  await runtime.ready;
  const server = runtime.app.listen(0, '127.0.0.1');
  t.after(async () => {
    try {
      if (server.listening) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
      await runtime.lifecycle.stop();
    } finally {
      await rm(storageDirectory, { recursive: true, force: true });
    }
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api/source-reader`;

  const installBytes = await sourceArchive('installable');
  const inspectInstall = await postArchive(baseUrl, '/plugins/import/inspect', installBytes);
  assert.equal(inspectInstall.status, 200);
  const installPreview = await readBody<{
    checksum: string;
    kind: string;
    pluginId: string;
    conflicts: unknown[];
  }>(inspectInstall);
  assert.equal(installPreview.error, null);
  assert.equal(installPreview.data.kind, 'studio-source');
  assert.equal(installPreview.data.pluginId, 'installable');
  assert.deepEqual(installPreview.data.conflicts, []);

  const beforeProjects = await fetch(`${baseUrl}/studio/projects`);
  assert.equal(beforeProjects.status, 200);
  assert.equal((await readBody<unknown[]>(beforeProjects)).data.length, 0);

  const installResponse = await postArchive(baseUrl, '/plugins/import/install', installBytes, {
    expectedChecksum: installPreview.data.checksum
  });
  assert.equal(installResponse.status, 202);
  const installed = await readBody<{ pluginId: string; status: string }>(installResponse);
  assert.equal(installed.error, null);
  assert.equal(installed.data.pluginId, 'installable');
  assert.equal(installed.data.status, 'pending-approval');

  const pluginsAfterInstall = await fetch(`${baseUrl}/plugins`);
  const installedList =
    await readBody<Array<{ pluginId: string; status: string }>>(pluginsAfterInstall);
  assert.equal(installedList.data.length, 1);
  assert.equal(installedList.data[0]?.status, 'pending-approval');

  const reinstallResponse = await postArchive(baseUrl, '/plugins/import/install', installBytes, {
    expectedChecksum: installPreview.data.checksum
  });
  assert.equal(reinstallResponse.status, 202);
  const reinstalled = await readBody<{ pluginId: string; status: string }>(reinstallResponse);
  assert.equal(reinstalled.error, null);
  assert.equal(reinstalled.data.pluginId, 'installable');
  assert.equal(reinstalled.data.status, 'pending-approval');

  const projectsAfterInstall = await fetch(`${baseUrl}/studio/projects`);
  assert.equal((await readBody<unknown[]>(projectsAfterInstall)).data.length, 0);

  const importBytes = await sourceArchive('import-only');
  const inspectImport = await postArchive(baseUrl, '/plugins/import/inspect', importBytes);
  const importPreview = await readBody<{ checksum: string }>(inspectImport);
  const importResponse = await postArchive(baseUrl, '/studio/projects/import', importBytes, {
    expectedChecksum: importPreview.data.checksum,
    resolutionJson: JSON.stringify({ type: 'create-copy' })
  });
  assert.equal(importResponse.status, 201);
  const imported = await readBody<{ pluginId: string; revision: number }>(importResponse);
  assert.equal(imported.data.pluginId, 'import-only');
  assert.equal(imported.data.revision, 1);
  const pluginsAfterImport = await fetch(`${baseUrl}/plugins`);
  assert.equal((await readBody<unknown[]>(pluginsAfterImport)).data.length, 1);

  const wildcardImportBytes = await sourceArchive('wildcard-import', [
    'wildcard-import.example',
    '*.wildcard-import.example'
  ]);
  const wildcardPreviewResponse = await postArchive(
    baseUrl,
    '/plugins/import/inspect',
    wildcardImportBytes
  );
  const wildcardPreview = await readBody<{ checksum: string }>(wildcardPreviewResponse);
  const wildcardImportResponse = await postArchive(
    baseUrl,
    '/studio/projects/import',
    wildcardImportBytes,
    {
      expectedChecksum: wildcardPreview.data.checksum,
      resolutionJson: JSON.stringify({ type: 'create-copy' })
    }
  );
  assert.equal(wildcardImportResponse.status, 201);
  const wildcardImported = await readBody<{ pluginId: string }>(wildcardImportResponse);
  assert.equal(wildcardImported.data.pluginId, 'wildcard-import');

  const mismatchBytes = await sourceArchive('checksum-mismatch');
  const inspectMismatch = await postArchive(baseUrl, '/plugins/import/inspect', mismatchBytes);
  assert.equal(inspectMismatch.status, 200);
  const mismatchResponse = await postArchive(baseUrl, '/plugins/import/install', mismatchBytes, {
    expectedChecksum: '0'.repeat(64)
  });
  assert.equal(mismatchResponse.status, 409);
  const mismatchBody = await readBody(mismatchResponse);
  assert.equal(mismatchBody.error?.code, 'CONFLICT');
  const pluginsAfterMismatch = await fetch(`${baseUrl}/plugins`);
  assert.equal((await readBody<unknown[]>(pluginsAfterMismatch)).data.length, 1);

  const staleBytes = await sourceArchive('stale-import');
  const staleInspect = await postArchive(baseUrl, '/plugins/import/inspect', staleBytes);
  const stalePreview = await readBody<{ checksum: string }>(staleInspect);
  const staleCreated = await postArchive(baseUrl, '/studio/projects/import', staleBytes, {
    expectedChecksum: stalePreview.data.checksum,
    resolutionJson: JSON.stringify({ type: 'create-copy' })
  });
  const staleProject = await readBody<{ id: string; revision: number }>(staleCreated);
  const updateResponse = await fetch(`${baseUrl}/studio/projects/${staleProject.data.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision: 1, name: 'Changed before import' })
  });
  assert.equal(updateResponse.status, 200);

  const staleImport = await postArchive(baseUrl, '/studio/projects/import', staleBytes, {
    expectedChecksum: stalePreview.data.checksum,
    resolutionJson: JSON.stringify({
      type: 'update',
      projectId: staleProject.data.id,
      expectedRevision: 1
    })
  });
  assert.equal(staleImport.status, 409);
  const staleBody = await readBody(staleImport);
  assert.equal(staleBody.error?.code, 'CONFLICT');
  const unchanged = await fetch(`${baseUrl}/studio/projects/${staleProject.data.id}`);
  const unchangedBody = await readBody<{ name: string; revision: number }>(unchanged);
  assert.equal(unchangedBody.data.name, 'Changed before import');
  assert.equal(unchangedBody.data.revision, 2);

  const legacyInstall = await postArchive(
    baseUrl,
    '/plugins/install',
    await builtArchive('legacy-direct'),
    {},
    'legacy-direct.source-plugin'
  );
  assert.equal(legacyInstall.status, 202);
  const legacyBody = await readBody<{ pluginId: string; status: string }>(legacyInstall);
  assert.equal(legacyBody.data.pluginId, 'legacy-direct');
  assert.equal(legacyBody.data.status, 'pending-approval');
});
