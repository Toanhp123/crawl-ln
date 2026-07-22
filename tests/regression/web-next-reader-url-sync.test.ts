import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isReaderUrlOnlySync } from '../../apps/web-next/src/features/read-chapter/lib/reader-route-sync';

test('reader recognizes URL-only active chapter synchronization', () => {
  const snapshot = {
    activeIndex: 4,
    chapters: [{ index: 3 }, { index: 4 }, { index: 5 }]
  };

  assert.equal(isReaderUrlOnlySync(snapshot, 4), true);
  assert.equal(isReaderUrlOnlySync(snapshot, 5), false);
  assert.equal(isReaderUrlOnlySync({ activeIndex: 4, chapters: [] }, 4), false);
});

test('reader route changes do not own session teardown', async () => {
  const source = await readFile(
    'apps/web-next/src/features/read-chapter/model/use-reader-controller.ts',
    'utf8'
  );

  assert.match(source, /isReaderUrlOnlySync/);
  assert.match(source, /useEffect\(\(\) => \(\) => session\.cancel\(\), \[session\]\)/);
  assert.doesNotMatch(source, /session\.start[\s\S]*return \(\) => session\.cancel\(\)/);
});

test('reader page skips scroll reset during URL-only synchronization', async () => {
  const source = await readFile(
    'apps/web-next/src/pages/chapter-reader/ui/ChapterReaderPage.tsx',
    'utf8'
  );

  assert.match(source, /isReaderUrlOnlySync/);
  assert.match(source, /if \(isReaderUrlOnlySync\([\s\S]*\)\) return;/);
});
