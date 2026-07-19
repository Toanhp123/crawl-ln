import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('Surface is structural and never owns elevation', async () => {
  const surface = await read('apps/web/src/shared/ui/layout/Surface.tsx');

  assert.match(surface, /default:\s*'bg-surface'/);
  assert.match(surface, /subtle:\s*'bg-surface2'/);
  assert.doesNotMatch(surface, /elevated:/);
  assert.doesNotMatch(surface, /shadow-\[var\(--elevation-/);
});

test('Card owns canonical elevation and interactive hierarchy', async () => {
  const card = await read('apps/web/src/shared/ui/layout/Card.tsx');

  assert.match(card, /flat:\s*'shadow-\[var\(--elevation-0\)\]'/);
  assert.match(card, /raised:\s*'shadow-\[var\(--elevation-1\)\]'/);
  assert.match(card, /floating:\s*'shadow-\[var\(--elevation-2\)\]'/);
  assert.match(card, /defaultVariants:[\s\S]*elevation:\s*'raised'/);
  assert.match(card, /hover:shadow-\[var\(--elevation-2\)\]/);
  assert.doesNotMatch(card, /\blow:/);
  assert.doesNotMatch(card, /\bcard:/);
});

test('Panel is a dense grouping primitive without elevation', async () => {
  const panel = await read('apps/web/src/shared/ui/layout/Panel.tsx');
  const index = await read('apps/web/src/shared/ui/index.ts');

  assert.match(panel, /subtle:\s*'border border-border bg-surface2'/);
  assert.match(panel, /inset:\s*'bg-surface2'/);
  assert.doesNotMatch(panel, /shadow-/);
  assert.match(index, /layout\/Panel/);
});

test('shared overlays use the highest elevation while toasts use the floating level', async () => {
  const modal = await read('apps/web/src/shared/ui/overlay/Modal.tsx');
  const sheet = await read('apps/web/src/shared/ui/overlay/BottomSheet.tsx');
  const drawer = await read('apps/web/src/shared/ui/overlay/Drawer.tsx');
  const toast = await read('apps/web/src/shared/ui/feedback/Toast.tsx');

  for (const source of [modal, sheet, drawer]) {
    assert.match(source, /shadow-\[var\(--elevation-3\)\]/);
  }
  assert.match(toast, /shadow-\[var\(--elevation-2\)\]/);
});

test('shared primitives do not introduce pixel radii or arbitrary visual shadows', async () => {
  const files = await readdir(new URL('apps/web/src/shared/ui/', root), { recursive: true });
  const sources = await Promise.all(
    files
      .filter((path) => /\.(?:ts|tsx)$/.test(path))
      .map(async (path) => ({ path, source: await read(`apps/web/src/shared/ui/${path}`) }))
  );

  for (const { path, source } of sources) {
    assert.doesNotMatch(source, /rounded-\[[0-9]+px\]/, `${path} uses a pixel radius`);
    assert.doesNotMatch(
      source,
      /shadow-\[(?!var\(--(?:elevation-[0-3]|focus-ring)\)|inset_var\(--focus-ring\))[^\]]+\]/,
      `${path} uses an arbitrary shadow`
    );
    assert.doesNotMatch(source, /(?:^|\s)shadow(?:\s|['"`])/, `${path} uses a bare shadow`);
  }
});

test('features no longer ask Surface to act as an elevated card', async () => {
  const files = await readdir(new URL('apps/web/src/', root), { recursive: true });
  const sources = await Promise.all(
    files.filter((path) => /\.(?:ts|tsx)$/.test(path)).map((path) => read(`apps/web/src/${path}`))
  );

  assert.doesNotMatch(sources.join('\n'), /<Surface[^>]*tone=["']elevated["']/);
});
