import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('app container composes a standalone source reader before crawler', async () => {
  const container = await readFile('apps/api/src/shared/container/app-container.ts', 'utf8');
  const moduleSource = await readFile(
    'apps/api/src/shared/container/modules/source-reader.module.ts',
    'utf8'
  );
  assert.match(container, /createSourceReaderModule/);
  assert.match(container, /const sourceReader = createSourceReaderModule\(infrastructure\)/);
  assert.match(container, /createCrawlerModule\([^)]*sourceReader/s);
  assert.match(moduleSource, /satisfies SourceReaderApi/);
  assert.doesNotMatch(moduleSource, /modules\/crawler\/infrastructure/);
});
