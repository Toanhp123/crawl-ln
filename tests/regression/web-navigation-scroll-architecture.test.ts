import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('app and reader shells own independent scroll viewports', () => {
  const appShell = read('apps/web/src/app/layouts/AppShell.tsx');
  const readerShell = read('apps/web/src/app/layouts/ReaderShell.tsx');
  assert.match(appShell, /AppScrollViewport/);
  assert.match(readerShell, /ScrollViewport/);
  assert.match(readerShell, /id="reader-scroll-root"/);
});

test('document scrolling is disabled and smooth behavior is opt-in only', () => {
  const css = read('apps/web/src/app/styles/index.css');
  assert.doesNotMatch(css, /scroll-behavior:\s*smooth/);
  assert.match(css, /html,\s*body,\s*#root[^{]*\{[^}]*height:\s*100%/s);
  assert.match(css, /overflow:\s*hidden/);
});

test('reader scroll behavior is scoped to the reader viewport', () => {
  const page = read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  const progress = read('apps/web/src/features/read-chapter/model/useReaderProgress.ts');
  const anchors = read('apps/web/src/features/read-chapter/model/readingAnchor.ts');
  assert.match(page, /useScrollViewport/);
  assert.match(page, /scrollViewport\.current/);
  assert.doesNotMatch(page, /window\.scrollY|window\.scrollTo|window\.scrollBy/);
  assert.doesNotMatch(page, /window\.addEventListener\('scroll'/);
  assert.match(progress, /viewportRef/);
  assert.doesNotMatch(progress, /window\.scrollY/);
  assert.match(anchors, /viewport:\s*HTMLElement/);
  assert.doesNotMatch(anchors, /window\.scrollY|window\.scrollTo/);
});

test('app scroll restoration keeps the background entry stable while reader overlay is open', () => {
  const viewport = read('apps/web/src/app/layouts/AppScrollViewport.tsx');
  const navigationState = read('apps/web/src/shared/navigation/readerReturnState.ts');
  assert.match(viewport, /useLocation/);
  assert.match(viewport, /readBackgroundScrollKey\(location\.state\) \?\? location\.key/);
  assert.match(viewport, /behavior:\s*'auto'/);
  assert.match(navigationState, /backgroundScrollKey/);
});
