import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Sources clips the rounded panel and scrolls inside a hidden-scrollbar child', async () => {
  const source = await readFile('apps/web/src/pages/sources/ui/SourcesPage.tsx', 'utf8');
  assert.match(source, /<Panel tone="inset" padding="none" className="overflow-hidden">/);
  assert.match(source, /className="no-scrollbar overflow-x-auto p-\[var\(--panel-padding-sm\)\]"/);
  assert.match(source, /className="flex min-w-max gap-2" role="navigation"/);
  assert.doesNotMatch(source, /<Panel[^>]+className="overflow-x-auto"/);
});
