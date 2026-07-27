import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Sources plugin toolbar keeps install action beside the flexing search field', async () => {
  const overview = await readFile(
    'apps/web/src/widgets/source-reader-overview/ui/SourceReaderOverview.tsx',
    'utf8'
  );

  assert.match(
    overview,
    /<Section title=\{t\('sources\.plugins\.summary'\)\}>[\s\S]*?<Panel tone="inset" className="flex items-center gap-2">/
  );
  assert.match(overview, /<SearchInput[\s\S]*?className="min-w-0 flex-1"[\s\S]*?\/>/);
  assert.match(overview, /<Button[\s\S]*?className="shrink-0"[\s\S]*?>/);
  assert.doesNotMatch(overview, /<Section[\s\S]*?action=\{/);
});
