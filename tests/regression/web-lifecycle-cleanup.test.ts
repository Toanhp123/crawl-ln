import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('web lifecycle resources are owned and cancellable', () => {
  const wakeLock = read('apps/web/src/pages/chapter-reader/model/useReaderWakeLock.ts');
  assert.match(wakeLock, /disposed/);
  assert.match(wakeLock, /visibilitychange/);
  assert.match(wakeLock, /acquired\.release/);

  const readerShell = read('apps/web/src/app/layouts/ReaderShell.tsx');
  assert.match(readerShell, /useLayoutEffect/);
  assert.doesNotMatch(readerShell, /useEffect\(/);

  const appScroll = read('apps/web/src/app/layouts/AppScrollViewport.tsx');
  assert.match(appScroll, /ResizeObserver/);
  assert.match(appScroll, /target <= maxTop/);

  const backup = read('apps/web/src/features/backup-library/ui/BackupRestorePanel.tsx');
  assert.match(backup, /AbortController/);
  assert.match(backup, /useMaintenanceOperation/);

  const exportMenu = read('apps/web/src/features/export-novel/ui/ExportMenu.tsx');
  assert.match(exportMenu, /AbortController/);

  const reader = read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  assert.match(reader, /openChapter\(stream\.activeIndex, true\)/);
});
