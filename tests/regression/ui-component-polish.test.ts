import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('bottom sheet owns a dynamic viewport scroll region', () => {
  const source = read('apps/web/src/shared/ui/overlay/BottomSheet.tsx');

  assert.match(source, /100dvh/);
  assert.match(source, /flex-col/);
  assert.match(source, /shrink-0/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
});

test('settings hub cards align content on the vertical center', () => {
  const source = read('apps/web/src/pages/settings/ui/SettingsHubCard.tsx');

  assert.match(source, /CardHeader className="items-center"/);
  assert.match(source, /flex min-w-0 items-center gap-3/);
  assert.doesNotMatch(source, /ChevronRight[^\n]+mt-1/);
});

test('crawl and novel detail actions stay in one horizontal row', () => {
  const addOverlay = read('apps/web/src/app/layouts/GlobalAddNovelOverlay.tsx');
  const detail = read('apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx');
  const management = read('apps/web/src/pages/novel-detail/ui/NovelManagementSheet.tsx');

  assert.match(addOverlay, /flex items-stretch gap-2/);
  assert.doesNotMatch(addOverlay, /min-\[420px\]:grid-cols/);
  assert.match(detail, /CardFooter className="flex-nowrap gap-3"/);
  assert.doesNotMatch(detail, /min-\[420px\]:grid-cols/);
  assert.match(management, /triggerClassName/);
});

test('library cards keep reader progress separate from the primary action', () => {
  const source = read('apps/web/src/entities/novel/ui/NovelLibraryCard.tsx');

  assert.match(source, /<Progress value=\{readingPercent\}/);
  assert.match(source, /className="mt-3 w-full justify-center"/);
  assert.doesNotMatch(source, /<CardFooter/);
});

test('library search and filter controls use canonical square touch targets', () => {
  const page = read('apps/web/src/pages/library/ui/LibraryPage.tsx');
  const search = read('apps/web/src/shared/ui/forms/SearchInput.tsx');

  assert.match(search, /h-\[var\(--touch-target\)\] min-h-0/);
  assert.doesNotMatch(search, /min-h-\[3\.25rem\]/);
  assert.match(page, /<IconButton/);
  assert.match(page, /SlidersHorizontal size=\{20\}/);
  assert.match(page, /<IconButton aria-label=\{t\('library\.controls'\)\}/);
  assert.doesNotMatch(page, /<Button[\s\S]{0,200}aria-label=\{t\('library\.controls'\)\}/);
});
