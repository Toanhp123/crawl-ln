import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('reader navigation state preserves the return URL and scroll identity', async () => {
  const navigation = (await import('../../apps/web/src/features/read-chapter/index.ts')) as Record<
    string,
    unknown
  >;
  assert.equal(typeof navigation.createReaderNavigationState, 'function');
  assert.equal(typeof navigation.readReaderReturnState, 'function');
  if (
    typeof navigation.createReaderNavigationState !== 'function' ||
    typeof navigation.readReaderReturnState !== 'function'
  ) {
    return;
  }

  const state = navigation.createReaderNavigationState as (
    returnPath: string,
    backgroundScrollKey?: string
  ) => unknown;
  const readState = navigation.readReaderReturnState as (value: unknown) => unknown;
  assert.deepEqual(state('/library?q=demo', 'scroll-1'), {
    readerReturnPath: '/library?q=demo',
    backgroundScrollKey: 'scroll-1'
  });
  assert.deepEqual(readState(state('/library?q=demo', 'scroll-1')), {
    readerReturnPath: '/library?q=demo',
    backgroundScrollKey: 'scroll-1'
  });
  assert.equal(readState({ readerReturnPath: '' }), null);
});

test('highlighted snippets recognize only mark tokens', async () => {
  const snippets =
    (await import('../../apps/web/src/features/search-library/lib/highlighted-snippet.ts')) as Record<
      string,
      unknown
    >;
  assert.equal(typeof snippets.splitHighlightedSnippet, 'function');
  if (typeof snippets.splitHighlightedSnippet !== 'function') return;

  const splitHighlightedSnippet = snippets.splitHighlightedSnippet as (
    value: string
  ) => Array<{ text: string; highlighted: boolean }>;
  assert.deepEqual(splitHighlightedSnippet('before <mark>match</mark> after'), [
    { text: 'before ', highlighted: false },
    { text: 'match', highlighted: true },
    { text: ' after', highlighted: false }
  ]);
  assert.deepEqual(splitHighlightedSnippet('<script>alert(1)</script>'), [
    { text: '<script>alert(1)</script>', highlighted: false }
  ]);
});

test('remaining parity details are wired through their intended owners', async () => {
  const [credential, library, novelDetail, chapterReader, searchPanel, taskInvalidation, realtime] =
    await Promise.all([
      readFile(
        'apps/web/src/features/manage-source-credential/ui/ReplaceSourceCredentialSecretButton.tsx',
        'utf8'
      ),
      readFile('apps/web/src/pages/library/model/use-library-page.ts', 'utf8'),
      readFile('apps/web/src/pages/novel-detail/model/use-novel-detail-page.ts', 'utf8'),
      readFile('apps/web/src/pages/chapter-reader/model/use-chapter-reader-page.ts', 'utf8'),
      readFile('apps/web/src/features/search-library/ui/LibrarySearchPanel.tsx', 'utf8'),
      readFile('apps/web/src/entities/task/api/task-invalidation.ts', 'utf8'),
      readFile('apps/web/src/app/realtime/event-router.ts', 'utf8')
    ]);
  const taskConsumers = await Promise.all(
    [
      'add-novel/model/invalidate-add-novel-result.ts',
      'cancel-task/model/use-cancel-task.ts',
      'crawl-novel/model/use-crawl-novel.ts',
      'delete-novel/model/use-delete-novel.ts',
      'pause-task/model/use-pause-task.ts',
      'resume-task/model/use-resume-task.ts',
      'update-novel/model/use-update-novel.ts'
    ].map((path) => readFile(`apps/web/src/features/${path}`, 'utf8'))
  );

  assert.match(credential, /disabled=\{!hasCredentialSecret\(credential\.strategy, secrets\)\}/);
  assert.match(library, /createReaderNavigationState/);
  assert.match(novelDetail, /createReaderNavigationState/);
  assert.match(chapterReader, /readReaderReturnState/);
  assert.match(searchPanel, /splitHighlightedSnippet/);
  assert.match(searchPanel, /<mark/);

  const taskSource = [taskInvalidation, realtime, ...taskConsumers].join('\n');
  assert.match(taskSource, /invalidateForNovel/);
  assert.doesNotMatch(taskSource, /\binvalidateNovel\b/);
});
