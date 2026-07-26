import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as repositoryBoundaries from '../../scripts/cli/lib/repository-boundaries.mjs';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

type RepositoryBoundariesModule = {
  checkFirstPartyPluginBoundaries?: (root: string) => Promise<string[]>;
};

async function checkFirstPartyPluginBoundaries(root: string): Promise<string[]> {
  const helper = (repositoryBoundaries as RepositoryBoundariesModule)
    .checkFirstPartyPluginBoundaries;
  assert.ok(helper, 'checkFirstPartyPluginBoundaries must be exported');
  return helper(root);
}

async function createBoundaryFixture(
  t: test.TestContext,
  files: Record<string, string>
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novelcool-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, source] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, source);
  }
  return root;
}

test('NovelCool exists only as an external workspace plugin', async () => {
  const sourceReaderModule = await readFile(
    'apps/api/src/modules/source-reader/source-reader.module.ts',
    'utf8'
  );
  assert.doesNotMatch(sourceReaderModule, /novelCoolPlugin|built-in\/novelcool/);
  await assert.rejects(
    () => access('apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool'),
    { code: 'ENOENT' }
  );
});

test('repository has no first-party plugin boundary violations', async () => {
  assert.deepEqual(await checkFirstPartyPluginBoundaries(repositoryRoot), []);
});

test('repository boundaries reject plugins importing application code', async (t) => {
  const root = await createBoundaryFixture(t, {
    'plugins/novelcool/src/index.ts':
      "import '../../../apps/api/src/example.js';\nexport default {};\n",
    'apps/api/src/example.ts': 'export const example = true;\n'
  });

  assert.deepEqual(await checkFirstPartyPluginBoundaries(root), [
    'First-party plugin imports application code: plugins/novelcool/src/index.ts'
  ]);
});

test('repository boundaries reject applications importing plugin source', async (t) => {
  const root = await createBoundaryFixture(t, {
    'plugins/novelcool/src/index.ts': 'export default {};\n',
    'apps/api/src/example.ts':
      "import plugin from '../../../plugins/novelcool/src/index.js';\nexport { plugin };\n"
  });

  assert.deepEqual(await checkFirstPartyPluginBoundaries(root), [
    'Application imports first-party plugin source: apps/api/src/example.ts'
  ]);
});

test('repository boundaries inspect dynamic imports and static re-exports', async (t) => {
  const root = await createBoundaryFixture(t, {
    'plugins/novelcool/src/index.ts': 'export default {};\n',
    'plugins/novelcool/src/dynamic.ts':
      "export const load = () => import('../../../apps/web/src/example.js');\n",
    'apps/web/src/example.ts':
      "export { default } from '../../../plugins/novelcool/src/index.js';\n"
  });

  assert.deepEqual(await checkFirstPartyPluginBoundaries(root), [
    'Application imports first-party plugin source: apps/web/src/example.ts',
    'First-party plugin imports application code: plugins/novelcool/src/dynamic.ts'
  ]);
});

test('repository boundaries reject built-in NovelCool references and skip generated trees', async (t) => {
  const root = await createBoundaryFixture(t, {
    'apps/api/src/example.ts':
      "export const legacy = 'infrastructure/plugins/built-in/novelcool';\n",
    'plugins/novelcool/dist/index.js':
      "import '../../../apps/api/src/example.js';\nexport default {};\n",
    'plugins/novelcool/node_modules/ignored/index.js':
      "import '../../../apps/api/src/example.js';\nexport default {};\n",
    'apps/api/dist/ignored.js':
      "import '../../../plugins/novelcool/src/index.js';\nexport default {};\n"
  });

  assert.deepEqual(await checkFirstPartyPluginBoundaries(root), [
    'Built-in NovelCool reference is forbidden: apps/api/src/example.ts'
  ]);
});

test('setup, start and full build never install or activate NovelCool', async () => {
  const [setup, start, build] = await Promise.all([
    readFile('scripts/cli/commands/setup.mjs', 'utf8'),
    readFile('scripts/cli/commands/start.mjs', 'utf8'),
    readFile('scripts/cli/commands/build.mjs', 'utf8')
  ]);

  assert.doesNotMatch(setup, /novelcool|source-plugin.*install|plugin.*activat/i);
  assert.doesNotMatch(start, /novelcool|source-plugin.*install|plugin.*activat/i);
  assert.doesNotMatch(
    build,
    /PluginInstallationService|PluginActivationService|InstallSourcePluginUseCase|EnablePluginUseCase/
  );
});
