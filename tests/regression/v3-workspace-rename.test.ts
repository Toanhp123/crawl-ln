import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { renameWorkspaces, rollbackWorkspaceRename } from '../../scripts/v3/rename-workspaces.mjs';

const execFileAsync = promisify(execFile);

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function write(root: string, path: string, content: string) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

async function packageName(root: string, path: string) {
  return JSON.parse(await readFile(join(root, path, 'package.json'), 'utf8')).name as string;
}

async function git(root: string, ...args: string[]) {
  const { stdout } = await execFileAsync('git', args, { cwd: root, encoding: 'utf8' });
  return stdout.trim();
}

function candidateManifest(commit: string) {
  return {
    formatVersion: 1,
    commit,
    migrationReportSha256: 'a'.repeat(64),
    verification: {
      command: 'npm run verify:v3',
      passed: true,
      completedAt: '2026-07-22T00:00:00.000Z'
    },
    smoke: {
      apiHealth: true,
      httpContracts: true,
      webRoutes: true,
      reader: true,
      sourceReaderAdmin: true
    }
  };
}

async function workspaceFixture(options: { occupiedTarget?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-workspace-'));
  await write(
    root,
    'package.json',
    `${JSON.stringify(
      {
        name: 'fixture',
        private: true,
        workspaces: ['apps/*'],
        scripts: {
          dev: 'concurrently "npm run dev -w @novel-tool/api" "npm run dev -w @novel-tool/web"',
          'dev:api': 'npm run dev -w @novel-tool/api',
          'dev:api-next': 'npm run dev -w @novel-tool/api-next',
          'dev:web': 'npm run dev -w @novel-tool/web',
          'dev:web-next': 'npm run dev -w @novel-tool/web-next',
          build: 'npm run build -w @novel-tool/api && npm run build -w @novel-tool/web',
          'build:api-next': 'npm run build -w @novel-tool/api-next',
          'build:web-next': 'npm run build -w @novel-tool/web-next',
          check: 'npm run check -w @novel-tool/api && npm run check -w @novel-tool/web',
          'check:api-next': 'npm run check -w @novel-tool/api-next',
          'check:web-next': 'npm run check -w @novel-tool/web-next',
          'test:e2e': 'playwright test',
          'test:e2e:web-next': 'playwright test --config playwright.web-next.config.ts'
        }
      },
      null,
      2
    )}\n`
  );
  await write(root, 'apps/api/package.json', '{"name":"@novel-tool/api"}\n');
  await write(root, 'apps/api/src/current.ts', "export const root = 'apps/api/src';\n");
  await write(root, 'apps/web/package.json', '{"name":"@novel-tool/web"}\n');
  await write(root, 'apps/web/src/current.ts', "export const root = 'apps/web/src';\n");
  await write(root, 'apps/api-next/package.json', '{"name":"@novel-tool/api-next"}\n');
  await write(root, 'apps/api-next/.env', 'NEXT_API_PORT=3100\nNEXT_STORAGE_DIR=./storage\n');
  await write(
    root,
    'apps/api-next/src/platform/config/environment.ts',
    "const apiNextRootDirectory = 'apps/api-next';\nexport const env = { NEXT_API_HOST: '127.0.0.1', NEXT_API_PORT: 3100, NEXT_STORAGE_DIR: './storage' };\n"
  );
  await write(root, 'apps/web-next/package.json', '{"name":"@novel-tool/web-next"}\n');
  await write(
    root,
    'apps/web-next/vite.config.ts',
    "const webNextRoot = 'apps/web-next';\nexport default { server: { port: 5174, proxy: 'http://localhost:3100' }, preview: { port: 4174 } };\n"
  );

  const movedScripts: Record<string, string> = {
    'scripts/check-api-architecture.mjs': "const root = 'apps/api/src';\n",
    'scripts/check-web-architecture.mjs': "const root = 'apps/web/src';\n",
    'scripts/check-web-contracts.mjs': "const root = 'apps/web/src';\n",
    'scripts/check-api-next-architecture.mjs':
      "import { checkApiNextArchitecture } from './lib/api-next-architecture.mjs';\nconst root = 'apps/api-next/src';\n",
    'scripts/check-web-next-architecture.mjs':
      "import { checkWebNextArchitecture } from './lib/web-next-architecture.mjs';\nconst root = 'apps/web-next';\n",
    'scripts/check-web-next-contracts.mjs': "const root = 'apps/web-next/src';\n",
    'scripts/lib/api-next-architecture.mjs':
      'export function checkApiNextArchitecture() { return []; }\n',
    'scripts/lib/web-next-architecture.mjs':
      'export function checkWebNextArchitecture() { return []; }\n',
    'playwright.config.ts':
      "export default { use: { baseURL: 'http://127.0.0.1:4173' }, webServer: { command: 'npm run preview -w @novel-tool/web -- --port 4173' } };\n",
    'playwright.web-next.config.ts':
      "export default { use: { baseURL: 'http://127.0.0.1:4174' }, webServer: [{ command: 'npm run preview -w @novel-tool/web -- --port 4173' }, { command: 'npm run preview -w @novel-tool/web-next -- --port 4174' }] };\n"
  };
  for (const [path, content] of Object.entries(movedScripts)) await write(root, path, content);
  await write(
    root,
    'scripts/verify-v3.mjs',
    "const api = 'apps/api-next'; const web = 'apps/web-next'; const config = 'playwright.web-next.config.ts';\n"
  );
  await write(
    root,
    'tests/regression/workspace-paths.test.ts',
    "const legacy = 'apps/api/src'; const candidate = 'apps/api-next/src'; const web = 'apps/web-next/src';\n"
  );

  await git(root, 'init');
  await git(root, 'config', 'user.email', 'fixture@example.invalid');
  await git(root, 'config', 'user.name', 'Fixture');
  await git(root, 'add', '.');
  await git(root, 'commit', '-m', 'fixture');
  const commit = await git(root, 'rev-parse', 'HEAD');
  if (options.occupiedTarget) {
    await mkdir(join(root, options.occupiedTarget), { recursive: true });
    await write(root, join(options.occupiedTarget, 'owner.txt'), 'keep\n');
  }
  return { root, commit, manifest: candidateManifest(commit) };
}

async function trackedSnapshot(root: string) {
  const paths = (await git(root, 'ls-files')).split(/\r?\n/).filter(Boolean);
  const values = await Promise.all(
    paths.map(async (path) => [path, await readFile(join(root, path))])
  );
  return new Map(
    values.map(([path, value]) => [String(path), Buffer.from(value as Buffer).toString('hex')])
  );
}

test('workspace rename is all-or-nothing and rewrites canonical package roles', async () => {
  const fixture = await workspaceFixture();
  const result = await renameWorkspaces(fixture.root, fixture.manifest);

  assert.equal(await packageName(fixture.root, 'apps/api'), '@novel-tool/api');
  assert.equal(await packageName(fixture.root, 'apps/web'), '@novel-tool/web');
  assert.equal(await packageName(fixture.root, 'apps/api-legacy'), '@novel-tool/api-legacy');
  assert.equal(await packageName(fixture.root, 'apps/web-legacy'), '@novel-tool/web-legacy');
  assert.match(
    await readFile(join(fixture.root, 'apps/api/src/platform/config/environment.ts'), 'utf8'),
    /PORT:\s*3000/
  );
  assert.match(await readFile(join(fixture.root, 'apps/api/.env'), 'utf8'), /PORT=3000/);
  assert.match(await readFile(join(fixture.root, 'apps/web/vite.config.ts'), 'utf8'), /5173/);
  const playwright = await readFile(join(fixture.root, 'playwright.config.ts'), 'utf8');
  assert.match(playwright, /@novel-tool\/web-legacy.*4174/);
  assert.match(playwright, /@novel-tool\/web.*4173/);
  const rootPackage = JSON.parse(await readFile(join(fixture.root, 'package.json'), 'utf8'));
  assert.match(rootPackage.scripts.dev, /@novel-tool\/api(?!-legacy)/);
  assert.match(rootPackage.scripts['dev:legacy'], /@novel-tool\/api-legacy/);
  assert.equal(rootPackage.scripts['dev:api-next'], undefined);
  assert.equal(result.state, 'completed');

  const rolledBack = await rollbackWorkspaceRename(fixture.root, result.journal);

  assert.equal(await packageName(fixture.root, 'apps/api'), '@novel-tool/api');
  assert.equal(await packageName(fixture.root, 'apps/api-next'), '@novel-tool/api-next');
  assert.equal(await exists(join(fixture.root, 'apps/api-legacy')), false);
  assert.equal(rolledBack.state, 'rolled-back');
});

test('workspace rename refuses occupied target paths without moving files', async () => {
  const fixture = await workspaceFixture({ occupiedTarget: 'apps/api-legacy' });

  await assert.rejects(
    () => renameWorkspaces(fixture.root, fixture.manifest),
    /target.*exists|occupied/i
  );

  assert.equal(await exists(join(fixture.root, 'apps/api-next')), true);
  assert.equal(await packageName(fixture.root, 'apps/api'), '@novel-tool/api');
  assert.equal(await readFile(join(fixture.root, 'apps/api-legacy/owner.txt'), 'utf8'), 'keep\n');
});

test('workspace rename dry run lists changes without writing the repository', async () => {
  const fixture = await workspaceFixture();
  const before = await trackedSnapshot(fixture.root);

  const result = await renameWorkspaces(fixture.root, fixture.manifest, { dryRun: true });

  assert.equal(result.state, 'dry-run');
  assert.ok(result.moves.length > 0);
  assert.ok(result.rewrites.includes('package.json'));
  assert.deepEqual(await trackedSnapshot(fixture.root), before);
  assert.equal(
    await exists(join(fixture.root, '.artifacts/v3/workspace-rename-journal.json')),
    false
  );
});

test('workspace rename rolls back completed moves and rewrites after an injected write failure', async () => {
  const fixture = await workspaceFixture();
  const before = await trackedSnapshot(fixture.root);
  let writes = 0;

  await assert.rejects(
    () =>
      renameWorkspaces(fixture.root, fixture.manifest, {
        writeContent: async (path: string, content: Buffer) => {
          writes += 1;
          if (writes === 2) throw new Error('injected rewrite failure');
          await writeFile(path, content);
        }
      }),
    /injected rewrite failure/i
  );

  assert.deepEqual(await trackedSnapshot(fixture.root), before);
  assert.equal(await exists(join(fixture.root, 'apps/api-next')), true);
  assert.equal(await exists(join(fixture.root, 'apps/api-legacy')), false);
});

test('workspace rename restores every source after an injected rename failure', async () => {
  const fixture = await workspaceFixture();
  const before = await trackedSnapshot(fixture.root);
  let injected = false;
  let journalObserved = false;

  await assert.rejects(
    () =>
      renameWorkspaces(fixture.root, fixture.manifest, {
        renamePath: async (source: string, target: string) => {
          journalObserved ||= await exists(
            join(fixture.root, '.artifacts/v3/workspace-rename-journal.json')
          );
          if (!injected && target === join(fixture.root, 'apps/api')) {
            injected = true;
            throw new Error('injected workspace move failure');
          }
          await rename(source, target);
        }
      }),
    /injected workspace move failure/i
  );

  assert.deepEqual(await trackedSnapshot(fixture.root), before);
  assert.equal(journalObserved, true);
  assert.equal(await exists(join(fixture.root, 'apps/api-next')), true);
  assert.equal(await exists(join(fixture.root, 'apps/api-legacy')), false);
});

test('workspace rollback keeps completed roles intact when a reverse rename fails', async () => {
  const fixture = await workspaceFixture();
  const result = await renameWorkspaces(fixture.root, fixture.manifest);
  let injected = false;

  await assert.rejects(
    () =>
      rollbackWorkspaceRename(fixture.root, result.journal, {
        renamePath: async (source: string, target: string) => {
          if (!injected && target === join(fixture.root, 'apps/api')) {
            injected = true;
            throw new Error('injected workspace rollback failure');
          }
          await rename(source, target);
        }
      }),
    /injected workspace rollback failure/i
  );

  assert.equal(await packageName(fixture.root, 'apps/api'), '@novel-tool/api');
  assert.equal(await packageName(fixture.root, 'apps/api-legacy'), '@novel-tool/api-legacy');
  assert.equal(await exists(join(fixture.root, 'apps/api-next')), false);
});

test('workspace rename rejects a stale candidate manifest and tracked dirty files', async () => {
  const fixture = await workspaceFixture();
  await assert.rejects(
    () => renameWorkspaces(fixture.root, { ...fixture.manifest, commit: 'different' }),
    /commit/i
  );

  await writeFile(join(fixture.root, 'package.json'), '{}\n', 'utf8');
  await assert.rejects(
    () => renameWorkspaces(fixture.root, fixture.manifest),
    /tracked.*clean|dirty/i
  );
});
