import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('continue reading restores the saved paragraph before marking the reader interactive', () => {
  const page = read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  assert.match(page, /useLayoutEffect/);
  assert.match(page, /const initialChapterLoaded/);
  const restore = page.indexOf('restoreReadingAnchor(saved, viewport, chapterRoot)');
  const restored = page.indexOf('restored.current = true', restore);
  const interactive = page.indexOf("scrollPhase.current = 'interactive'", restored);
  assert.ok(restore >= 0 && restored > restore && interactive > restored);
  assert.doesNotMatch(page, /window\.history\.replaceState/);
});

test('reader persists the exact active-chapter anchor before closing', () => {
  const page = read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  assert.match(page, /const persistCurrentPosition = useCallback/);
  assert.match(page, /#reader-chapter-\$\{activeChapter\.index\}/);
  assert.match(
    page,
    /onBack=\{\(\) => \{\s*persistCurrentPosition\(\);\s*scrollPhase\.current = 'leaving'/s
  );
  assert.match(page, /window\.setTimeout\(persistCurrentPosition, 220\)/);
});

test('reader semantics and app scroll cache are bounded', () => {
  const page = read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  const viewport = read('apps/web/src/app/layouts/AppScrollViewport.tsx');
  assert.match(page, /<article\s+ref=\{readerRoot\}/);
  assert.doesNotMatch(page, /<main\s+ref=\{readerRoot\}/);
  assert.match(viewport, /MAX_SCROLL_POSITIONS = 80/);
  assert.match(viewport, /rememberScrollPosition/);
});
