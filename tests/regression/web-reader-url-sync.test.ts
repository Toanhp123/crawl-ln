import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isReaderUrlOnlySync,
  isReaderUrlUpdatePending
} from '../../apps/web/src/features/read-chapter/lib/reader-route-sync';

test('reader recognizes URL-only active chapter synchronization', () => {
  const snapshot = {
    activeIndex: 4,
    chapters: [{ index: 3 }, { index: 4 }, { index: 5 }]
  };

  assert.equal(isReaderUrlOnlySync(snapshot, 4), true);
  assert.equal(isReaderUrlOnlySync(snapshot, 5), false);
  assert.equal(isReaderUrlOnlySync({ activeIndex: 4, chapters: [] }, 4), false);
});

test('reader recognizes an in-window URL update that has not reached the route yet', () => {
  const snapshot = {
    activeIndex: 11,
    chapters: [{ index: 9 }, { index: 10 }, { index: 11 }, { index: 12 }]
  };

  assert.equal(isReaderUrlUpdatePending(snapshot, 10), true);
  assert.equal(isReaderUrlUpdatePending(snapshot, 11), false);
  assert.equal(isReaderUrlUpdatePending({ activeIndex: 11, chapters: [] }, 10), false);
  assert.equal(isReaderUrlUpdatePending({ activeIndex: 11, chapters: [{ index: 11 }] }, 10), false);
  assert.equal(isReaderUrlUpdatePending({ activeIndex: 11, chapters: [{ index: 10 }] }, 10), false);
});

test('reader route changes do not own session teardown', async () => {
  const source = await readFile(
    'apps/web/src/features/read-chapter/model/use-reader-controller.ts',
    'utf8'
  );

  assert.match(source, /isReaderUrlOnlySync/);
  assert.match(source, /useEffect\(\(\) => \(\) => session\.cancel\(\), \[session\]\)/);
  assert.doesNotMatch(source, /session\.start[\s\S]*return \(\) => session\.cancel\(\)/);
});

test('reader page updates the URL without router synchronization during scroll', async () => {
  const page = await readFile('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx', 'utf8');
  const coordinator = await readFile(
    'apps/web/src/pages/chapter-reader/model/use-reader-scroll-coordinator.ts',
    'utf8'
  );

  assert.match(coordinator, /history\.replaceState/);
  assert.match(page, /useReaderScrollCoordinator/);
  assert.doesNotMatch(page, /model\.openChapter\(index, true\)/);
});
