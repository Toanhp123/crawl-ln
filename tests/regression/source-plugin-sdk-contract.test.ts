import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sdkRoot = join(root, 'packages/source-plugin-sdk');

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const target = join(directory, name);
    return statSync(target).isDirectory() ? sourceFiles(target) : [target];
  });
}

test('official source plugin sdk exists as a zero-dependency workspace package', () => {
  const packagePath = join(sdkRoot, 'package.json');
  assert.equal(existsSync(packagePath), true, 'SDK package.json must exist');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    name?: string;
    dependencies?: Record<string, string>;
    exports?: Record<string, unknown>;
  };
  assert.equal(packageJson.name, '@novel-tool/source-plugin-sdk');
  assert.deepEqual(packageJson.dependencies ?? {}, {});
  assert.ok(packageJson.exports?.['.']);
});

test('sdk source never imports API internals', () => {
  const files = sourceFiles(join(sdkRoot, 'src'));
  assert.ok(files.length > 0, 'SDK source files must exist');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /apps\/api|modules\/source-reader|\.\.\/\.\.\/apps/);
  }
});

test('external plugin fixture type-checks against asynchronous sdk context', () => {
  const requireFromRoot = createRequire(join(root, 'package.json'));
  const tsc = join(dirname(requireFromRoot.resolve('typescript/package.json')), 'bin', 'tsc');
  const result = spawnSync(
    process.execPath,
    [tsc, '-p', 'tests/fixtures/source-reader/sdk-plugin/tsconfig.json'],
    {
      cwd: root,
      encoding: 'utf8'
    }
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('capability method mapping excludes authentication orchestration', () => {
  const source = readFileSync(join(sdkRoot, 'src/capabilities.ts'), 'utf8');
  assert.match(source, /SourceDataCapability/);
  assert.doesNotMatch(source, /authentication:\s*'authenticate'/);
});
