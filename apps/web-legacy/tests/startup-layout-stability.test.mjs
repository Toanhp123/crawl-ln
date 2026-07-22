import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('library does not refetch merely because the window regains focus', () => {
  const source = read('pages/library/model/useLibraryPage.ts');
  assert.match(source, /refetchOnWindowFocus:\s*false/);
  assert.doesNotMatch(source, /refetchOnWindowFocus:\s*true/);
});

test('app shell owns the route suspense boundary so navigation chrome stays mounted', () => {
  const router = read('app/router/AppRouter.tsx');
  const shell = read('app/layouts/AppShell.tsx');
  assert.doesNotMatch(router, /<Suspense\s+fallback=/);
  assert.match(shell, /<Suspense\s+fallback=\{<RouteLoading\s*\/>\}>/);
  assert.match(shell, /<Outlet\s*\/>/);
});

test('home redirect is synchronous and performs no startup query', () => {
  const source = read('app/router/HomeRedirect.tsx');
  assert.match(source, /<Navigate\s+to="\/library"\s+replace\s*\/>/);
  assert.doesNotMatch(source, /useQuery|listNovels|LoadingState/);
});

test('library renders continue reading only from matching list data without a loading placeholder', () => {
  const model = read('pages/library/model/useLibraryPage.ts');
  const page = read('pages/library/ui/LibraryPage.tsx');
  assert.match(model, /const primaryNovel = items\.find/);
  assert.match(model, /primaryEntry && primaryNovel/);
  assert.match(page, /model\.readingHistory\[0\]/);
  assert.match(page, /ContinueReadingHero/);
  assert.doesNotMatch(page, /ContinueReadingSkeleton|primaryNovel\.isLoading/);
});

test('library skeleton mirrors page size and card structure', () => {
  const page = read('pages/library/ui/LibraryPage.tsx');
  assert.match(page, /LIBRARY_PAGE_SIZE/);
  assert.match(page, /Array\.from\(\{ length: LIBRARY_PAGE_SIZE \}/);
  assert.match(page, /LibraryCardSkeleton/);
  assert.match(page, /aspect-\[3\/4\]/);
  assert.doesNotMatch(page, /min-h-\[22rem\]/);
});
