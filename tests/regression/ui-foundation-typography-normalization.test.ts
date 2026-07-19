import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

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
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('grep', ['-R', '-n', '-E', 'text-\\[[0-9]+px\\]', ...paths], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8'
  });

  assert.equal(result.stdout.trim(), '');
});
