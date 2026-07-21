import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFile(join(root, path), 'utf8');

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const target = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(target) : [target];
    })
  );
  return files.flat();
}

test('app font preference changes typography tokens without scaling the root element', async () => {
  const typography = await read('apps/web/src/shared/theme/typography.css');

  assert.doesNotMatch(typography, /data-app-font='[^']+'\][^{]*\{[^}]*font-size\s*:/s);
  assert.match(typography, /data-app-font='small'[\s\S]*--type-body-size:/);
  assert.match(typography, /data-app-font='extra-large'[\s\S]*--type-display-size:/);
});

test('shared Text owns semantic title, body, caption and metric roles', async () => {
  const text = await read('apps/web/src/shared/ui/data-display/Text.tsx');

  for (const role of [
    'caption',
    'label',
    'bodySm',
    'body',
    'titleSm',
    'title',
    'headline',
    'display',
    'metricSm',
    'metricLg'
  ]) {
    assert.match(text, new RegExp(`${role}:`));
  }
  assert.match(text, /type-metric-sm/);
  assert.match(text, /type-metric-lg/);
});

test('web source does not introduce page-specific pixel font sizes', async () => {
  const paths = [
    'apps/web/src/features',
    'apps/web/src/pages',
    'apps/web/src/widgets',
    'apps/web/src/shared/ui'
  ];
  const files = (await Promise.all(paths.map((path) => sourceFiles(join(root, path))))).flat();
  const offenders: string[] = [];

  for (const file of files) {
    if (/text-\[[0-9]+px\]/.test(await readFile(file, 'utf8'))) {
      offenders.push(relative(root, file));
    }
  }

  assert.deepEqual(offenders, []);
});
