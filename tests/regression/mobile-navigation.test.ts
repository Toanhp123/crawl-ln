import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = (x: string) => readFileSync(new URL('../../' + x, import.meta.url), 'utf8');
test('bottom navigation has four reader-first destinations and a global add action', () => {
  const source = read('apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx');
  for (const route of ['/library', '/activity', '/sources', '/settings'])
    assert.match(source, new RegExp(route.replace('/', '\/')));
  assert.match(source, /kind:\s*'action'/);
  assert.doesNotMatch(source, /href:\s*'\/crawl'/);
  assert.doesNotMatch(source, /href:\s*'\/tasks'/);
  assert.match(source, /badge/);
});
