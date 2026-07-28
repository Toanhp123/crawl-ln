import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publishableWorkspaces = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'packages/shared/package.json',
  'packages/source-plugin-sdk/package.json',
  'packages/reader-engine/package.json'
];

test('all publishable workspaces and displayed build metadata use 1.0.0', async () => {
  for (const file of publishableWorkspaces) {
    const packageJson = JSON.parse(await readFile(file, 'utf8')) as { version?: string };
    assert.equal(packageJson.version, '1.0.0', file);
  }

  const source = await readFile(
    'apps/api/src/modules/source-reader/domain/plugin/source-reader-host-compatibility.ts',
    'utf8'
  );
  assert.match(source, /runtimeVersion:\s*['"]1\.0\.0['"]/);
  const appContainer = await readFile('apps/api/src/bootstrap/app-container.ts', 'utf8');
  const environment = await readFile('apps/api/src/platform/config/environment.ts', 'utf8');
  assert.match(appContainer, /appVersion\s*\?\?\s*['"]1\.0\.0['"]/);
  assert.match(environment, /APP_VERSION\s*\?\?\s*['"]1\.0\.0['"]/);
});

test('Source Plugin SDK capability and sandbox protocol contracts remain version 1', async () => {
  const compatibility = await readFile(
    'apps/api/src/modules/source-reader/domain/plugin/source-reader-host-compatibility.ts',
    'utf8'
  );
  const sandbox = await readFile(
    'apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.ts',
    'utf8'
  );
  const manifest = JSON.parse(await readFile('plugins/novelcool/manifest.json', 'utf8')) as {
    contracts?: Record<string, number>;
  };
  assert.match(compatibility, /sandboxProtocolVersion:\s*1/);
  assert.match(compatibility, /identify:\s*\[1\]/);
  assert.match(compatibility, /metadata:\s*\[1\]/);
  assert.match(sandbox, /SANDBOX_PROTOCOL_VERSION\s*=\s*1/);
  assert.equal(manifest.contracts?.identify, 1);
  assert.equal(manifest.contracts?.metadata, 1);
});

test('first-party NovelCool plugin has the external runtime boundary version', async () => {
  const packageJson = JSON.parse(await readFile('plugins/novelcool/package.json', 'utf8')) as {
    version?: string;
  };
  const manifest = JSON.parse(await readFile('plugins/novelcool/manifest.json', 'utf8')) as {
    id?: string;
    version?: string;
    engines?: { sourceReader?: string };
    runtime?: { preferredMode?: string };
    permissions?: { network?: { hosts?: string[] } };
  };

  assert.equal(packageJson.version, '1.0.0');
  assert.equal(manifest.id, 'novelcool');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.engines?.sourceReader, '^1.0.0');
  assert.equal(manifest.runtime?.preferredMode, 'isolated');
  assert.deepEqual(manifest.permissions?.network?.hosts, ['novelcool.com', '*.novelcool.com']);
});
