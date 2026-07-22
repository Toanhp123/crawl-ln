import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(
  'apps/web-legacy/src/pages/chapter-reader/ui/ChapterReaderPage.tsx',
  'utf8'
);
const bottomBar = readFileSync(
  'apps/web-legacy/src/widgets/reader-bottom-bar/ui/ReaderBottomBar.tsx',
  'utf8'
);
const offline = readFileSync(
  'apps/web-legacy/src/features/read-chapter/ui/ReaderOfflineBanner.tsx',
  'utf8'
);

describe('reader UX phase 2', () => {
  it('auto-hides chrome and exposes immersive reader feedback', () => {
    assert.match(page, /scheduleChromeHide/);
    assert.match(page, /ReaderOfflineBanner/);
    assert.match(page, /ReaderBottomBar/);
    assert.match(page, /toast\(\{\s*kind: 'success'/);
  });

  it('keeps navigation and progress in a dedicated bottom bar', () => {
    assert.match(bottomBar, /chapterPercent/);
    assert.match(bottomBar, /onPrevious/);
    assert.match(bottomBar, /onNext/);
  });

  it('shows a subtle offline state', () => {
    assert.match(offline, /t\('reader\.offline'\)/);
  });
});
