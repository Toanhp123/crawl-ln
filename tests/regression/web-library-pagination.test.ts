import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('library and content search keep pagination authority in their own scope', async () => {
  const libraryPagination =
    (await import('../../apps/web/src/pages/library/model/library-pagination.ts')) as Record<
      string,
      unknown
    >;
  const searchPagination =
    (await import('../../apps/web/src/features/search-library/model/search-pagination.ts')) as Record<
      string,
      unknown
    >;

  assert.equal(typeof libraryPagination.novelPageClampTarget, 'function');
  assert.equal(typeof searchPagination.searchPageClampTarget, 'function');
  if (
    typeof libraryPagination.novelPageClampTarget !== 'function' ||
    typeof searchPagination.searchPageClampTarget !== 'function'
  ) {
    return;
  }

  const novelPageClampTarget = libraryPagination.novelPageClampTarget as (
    scope: 'novels' | 'content',
    page: number,
    totalPages: number
  ) => number | null;
  const searchPageClampTarget = searchPagination.searchPageClampTarget as (
    page: number,
    totalPages: number,
    isPlaceholderData: boolean
  ) => number | null;

  assert.equal(novelPageClampTarget('novels', 3, 2), 2);
  assert.equal(novelPageClampTarget('content', 3, 1), null);
  assert.equal(searchPageClampTarget(3, 2, false), 2);
  assert.equal(searchPageClampTarget(3, 2, true), null);
  assert.equal(searchPageClampTarget(1, 1, false), null);
});

test('library page delegates clamping to its scope-owned helper', async () => {
  const source = await readFile('apps/web/src/pages/library/model/use-library-page.ts', 'utf8');
  assert.match(source, /novelPageClampTarget/);
  assert.doesNotMatch(source, /if \(page > totalPages\) setPage\(totalPages\)/);
});
