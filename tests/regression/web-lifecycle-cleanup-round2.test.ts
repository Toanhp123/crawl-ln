import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('reader session lifecycle is not cancelled by active chapter state updates', () => {
  const reader = read('apps/web-legacy/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  assert.match(reader, /useEffect\(\(\) => \{\s*return \(\) => \{[\s\S]*stream\.cancelSession\(\)/);
  assert.doesNotMatch(
    reader,
    /stream\.activeIndex,[\s\S]{0,120}stream\.chapters,[\s\S]{0,160}stream\.cancelSession/
  );
  assert.doesNotMatch(reader, /if \(!params\.novelId\)[\s\S]*const readingStats = useMemo/);
});

test('app scroll restoration observes content and suppresses writes while restoring', () => {
  const appScroll = read('apps/web-legacy/src/app/layouts/AppScrollViewport.tsx');
  assert.match(appScroll, /contentRef/);
  assert.match(appScroll, /observer\.observe\(content\)/);
  assert.match(appScroll, /restoringRef/);
});

test('reader requests and indexeddb cache have explicit lifecycle owners', () => {
  const source = read('apps/web-legacy/src/modules/reader/application/reader-chapter-source.ts');
  assert.match(source, /signal\?: AbortSignal/);
  assert.match(source, /this\.loader\(novelId, identity\.index, signal\)/);

  const infinite = read('apps/web-legacy/src/modules/reader/presentation/use-infinite-reader.ts');
  assert.match(infinite, /AbortController/);
  assert.match(infinite, /sessionController\.current\?\.abort\(\)/);

  const indexed = read(
    'apps/web-legacy/src/modules/reader/infrastructure/indexeddb-reader-cache.ts'
  );
  assert.match(indexed, /databasePromise/);
  assert.match(indexed, /onversionchange/);
});

test('restore mutation is app owned and novel detail polling pauses under reader overlay', () => {
  const backup = read('apps/web-legacy/src/features/backup-library/ui/BackupRestorePanel.tsx');
  assert.match(backup, /useMaintenanceOperation/);
  assert.doesNotMatch(backup, /operationController\.current\?\.abort\(\)/);

  const detail = read('apps/web-legacy/src/pages/novel-detail/model/useNovelDetailPage.ts');
  assert.match(detail, /readerOpen/);
  assert.match(detail, /enabled: !readerOpen/);
});
