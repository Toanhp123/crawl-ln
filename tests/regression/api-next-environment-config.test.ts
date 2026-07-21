import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createEnvironment } from '../../apps/api-next/src/platform/config/environment.ts';

const apiNextRoot = resolve('apps/api-next');
const environmentModuleUrl = pathToFileURL(
  resolve(apiNextRoot, 'src/platform/config/environment.ts')
).href;

test('api-next default storage is package-relative when launched as a workspace', () => {
  const script = `import(${JSON.stringify(environmentModuleUrl)}).then(({ createEnvironment }) => console.log(JSON.stringify(createEnvironment({}))))`;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: apiNextRoot,
    encoding: 'utf8',
    env: { ...process.env }
  });

  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(output, 'child process must print the resolved environment');
  const environment = JSON.parse(output) as {
    storageDirectory: string;
    databasePath: string;
  };
  assert.equal(environment.storageDirectory, resolve(apiNextRoot, 'storage'));
  assert.equal(environment.databasePath, resolve(apiNextRoot, 'storage/novel-tool.sqlite'));
});

test('api-next owns a package-local environment file and tracked example', async () => {
  const [source, example, gitignore] = await Promise.all([
    readFile(resolve(apiNextRoot, 'src/platform/config/environment.ts'), 'utf8'),
    readFile(resolve(apiNextRoot, '.env.example'), 'utf8'),
    readFile('.gitignore', 'utf8')
  ]);

  assert.doesNotMatch(source, /import 'dotenv\/config'/);
  assert.match(source, /loadDotenv\(\{\s*path:.*\.env/s);
  assert.match(example, /^NEXT_API_HOST=127\.0\.0\.1$/m);
  assert.match(example, /^NEXT_API_PORT=3100$/m);
  assert.match(example, /^NEXT_STORAGE_DIR=\.\/storage$/m);
  assert.match(example, /http:\/\/localhost:5174/);
  assert.match(gitignore, /^!apps\/api-next\/\.env\.example$/m);
});

test('api-next resolves relative path overrides against its package root', () => {
  const environment = createEnvironment({
    NEXT_STORAGE_DIR: './runtime-storage',
    NEXT_DATABASE_PATH: './runtime-storage/custom.sqlite',
    SOURCE_READER_PLUGIN_DIR: './runtime-storage/plugins'
  });

  assert.equal(environment.storageDirectory, resolve(apiNextRoot, 'runtime-storage'));
  assert.equal(environment.databasePath, resolve(apiNextRoot, 'runtime-storage/custom.sqlite'));
  assert.equal(environment.sourceReaderPluginDir, resolve(apiNextRoot, 'runtime-storage/plugins'));
});
