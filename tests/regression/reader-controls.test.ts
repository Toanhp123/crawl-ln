import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('reader preferences expose brightness and advanced typography controls', () => {
  const theme = read('apps/web/src/shared/theme/runtime/ThemeProvider.tsx');
  const sheet = read('apps/web/src/features/reader-preferences/ui/ReaderPreferencesSheet.tsx');
  assert.match(theme, /brightness:\s*number/);
  assert.match(theme, /--reader-dim-opacity/);
  for (const setting of [
    'paragraphSpacing',
    'pageMargin',
    'alignment',
    'fontWeight',
    'indent',
    'hyphenation',
    'dropCap',
    'keepAwake'
  ])
    assert.match(sheet, new RegExp(setting));
});

test('reader controls provide live progress, adjacent prefetch and guarded swipe navigation', () => {
  const page = read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  const model = read('apps/web/src/pages/chapter-reader/model/useChapterReaderPage.ts');
  const swipe = read('apps/web/src/features/read-chapter/model/useSwipeChapterNavigation.ts');
  assert.match(page, /useReaderProgress/);
  assert.match(page, /useSwipeChapterNavigation/);
  assert.match(page, /currentIndex=\{stream\.activeIndex\}/);
  assert.match(page, /useInfiniteReader/);
  assert.match(page, /stream\.previous/);
  assert.match(page, /stream\.next/);
  assert.doesNotMatch(model, /prefetchQuery/);
  assert.match(swipe, /Math\.abs\(dx\) >= 72/);
  assert.match(swipe, /ArrowRight/);
});
