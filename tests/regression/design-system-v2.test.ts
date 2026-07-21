import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (x: string) => readFileSync(join(root, x), 'utf8');
test('design system v2 token layers exist', () => {
  for (const f of ['motion.css', 'z-index.css', 'opacity.css', 'elevation.css'])
    assert.ok(existsSync(join(root, 'apps/web/src/shared/theme', f)));
  assert.match(read('apps/web/src/shared/theme/component-tokens.css'), /--control-min:\s*2\.75rem/);
  assert.match(read('apps/web/src/shared/theme/motion.css'), /prefers-reduced-motion/);
});
test('reader routes use a dedicated shell', () => {
  const r = read('apps/web/src/app/router/AppRouter.tsx');
  assert.match(r, /ReaderShell/);
  assert.match(r, /path="read\/:chapterIndex"/);
});
