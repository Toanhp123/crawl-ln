import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Source Plugin SDK keeps only local build and check capabilities', async () => {
  const packageJson = JSON.parse(
    await readFile(
      new URL('../../packages/source-plugin-sdk/package.json', import.meta.url),
      'utf8'
    )
  ) as { scripts: Record<string, string> };
  assert.deepEqual(packageJson.scripts, {
    build: 'tsc -p tsconfig.json',
    check: 'tsc -p tsconfig.json --noEmit'
  });
});

test('internal preparation includes the SDK without nested npm orchestration', async () => {
  const source = await readFile(
    new URL('../../scripts/cli/lib/internal-packages.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /sdk:\s*'packages\/source-plugin-sdk\/tsconfig\.json'/);
  assert.doesNotMatch(source, /spawn|execFile|npmInvocation/);
});
