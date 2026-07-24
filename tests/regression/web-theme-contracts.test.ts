import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

async function write(root: string, relative: string, source: string): Promise<void> {
  const target = join(root, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source);
}

test('theme contract reports missing, feature-owned, and conflicting shared tokens', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-theme-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const web = join(root, 'apps/web/src');

  await write(root, 'apps/web/src/shared/theme/base.css', ':root { --owned: 44px; --same: 1px; }');
  await write(root, 'apps/web/src/shared/theme/duplicate.css', ':root { --same: 2px; }');
  await write(
    root,
    'apps/web/src/features/example/example.css',
    ':root { --feature-only: 10px; } .feature { height: var(--owned); }'
  );
  await write(
    root,
    'apps/web/src/shared/ui/Example.tsx',
    "export const classes = 'h-[var(--missing)] w-[var(--feature-only)]';"
  );

  const { checkWebThemeContracts } = await import('../../scripts/lib/web-theme-contracts.mjs');
  const errors = await checkWebThemeContracts(web, root);
  assert.ok(errors.some((error) => error.includes('--missing') && error.includes('not defined')));
  assert.ok(
    errors.some((error) => error.includes('--feature-only') && error.includes('shared/theme'))
  );
  assert.ok(errors.some((error) => error.includes('--same') && error.includes('conflicting')));
});

test('Radix-owned runtime variables are allowed and the real web theme is valid', async () => {
  const { checkWebThemeContracts } = await import('../../scripts/lib/web-theme-contracts.mjs');
  assert.deepEqual(await checkWebThemeContracts('apps/web/src'), []);
});
