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

const currentSurfaceFiles = [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'docs/README.md',
  'docs/ARCHITECTURE.md',
  'docs/backend/BE_ARCHITECTURE_RULES.md',
  'docs/frontend/FSD.md',
  'docs/frontend/FE_BACKEND_CONTRACT_SYNC.md',
  'docs/E2E_TEST_CHECKLIST.md',
  'docs/SOURCE_READER.md',
  'scripts/verify.mjs',
  'scripts/check-prepared.mjs',
  'scripts/build-prepared.mjs',
  'scripts/clean.mjs',
  'scripts/setup-termux.sh',
  'scripts/termux-dev.sh',
  '.github/workflows/ci.yml'
];

test('all publishable workspaces and displayed build metadata use 3.0.0', async () => {
  for (const file of publishableWorkspaces) {
    const packageJson = JSON.parse(await readFile(file, 'utf8')) as { version?: string };
    assert.equal(packageJson.version, '3.0.0', file);
  }

  const source = await readFile(
    'apps/api/src/modules/source-reader/domain/plugin/source-reader-host-compatibility.ts',
    'utf8'
  );
  assert.match(source, /runtimeVersion:\s*['"]3\.0\.0['"]/);
  const appContainer = await readFile('apps/api/src/bootstrap/app-container.ts', 'utf8');
  const environment = await readFile('apps/api/src/platform/config/environment.ts', 'utf8');
  assert.match(appContainer, /appVersion\s*\?\?\s*['"]3\.0\.0['"]/);
  assert.match(environment, /APP_VERSION\s*\?\?\s*['"]3\.0\.0['"]/);
});

test('canonical commands and current docs contain no next or legacy workspace role', async () => {
  const source = (
    await Promise.all(currentSurfaceFiles.map((file) => readFile(file, 'utf8')))
  ).join('\n');
  assert.doesNotMatch(source, /api-next|web-next|api-legacy|web-legacy/);

  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  assert.equal(packageJson.scripts.verify, 'node scripts/verify.mjs');
  assert.equal(
    packageJson.scripts['verify:release'],
    'npm run verify && npm run test:e2e && npm run rehearse:v3:cutover'
  );
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    assert.doesNotMatch(`${name} ${command}`, /api-next|web-next|api-legacy|web-legacy/);
  }
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
  const manifest = await readFile(
    'apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.manifest.ts',
    'utf8'
  );
  assert.match(compatibility, /sandboxProtocolVersion:\s*1/);
  assert.match(compatibility, /identify:\s*\[1\]/);
  assert.match(compatibility, /metadata:\s*\[1\]/);
  assert.match(sandbox, /SANDBOX_PROTOCOL_VERSION\s*=\s*1/);
  assert.match(manifest, /sourceReader:\s*['"]>=1\.0\.0 <2\.0\.0['"]/);
});
