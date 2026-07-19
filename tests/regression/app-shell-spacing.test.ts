import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const shell = readFileSync(
  new URL('../../apps/web/src/app/layouts/AppShell.tsx', import.meta.url),
  'utf8'
);
const page = readFileSync(
  new URL('../../apps/web/src/shared/ui/layout/Page.tsx', import.meta.url),
  'utf8'
);
test('reserves content space above the fixed mobile bottom navigation', () => {
  assert.match(shell, /<AppScrollViewport>/);
  assert.match(shell, /<div id="main-content"/);
  assert.match(shell, /<Outlet\s*\/>/);
  assert.match(page, /app-nav-total/);
});
