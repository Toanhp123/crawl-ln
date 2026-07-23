import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

async function readTree(directory: string, root = directory): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(await readTree(target, root));
    else parts.push(`\n/* ${relative(root, target)} */\n${await readFile(target, 'utf8')}`);
  }
  return parts.join('\n');
}

test('web reader controller delegates window and loading behavior to reader-engine', async () => {
  const source = await readFile(
    'apps/web/src/features/read-chapter/model/use-reader-controller.ts',
    'utf8'
  );
  assert.match(source, /createReaderSession/);
  assert.match(source, /MemoryReaderChapterCache/);
  assert.match(source, /onActiveIndexChange/);
  assert.match(source, /onNavigate/);
  assert.match(source, /session\.subscribe/);
  assert.match(source, /lastReportedIndex\.current\s*=\s*null/);
  assert.doesNotMatch(source, /function trimAroundActive|class ReaderChapterSource/);
  assert.doesNotMatch(source, /react-router|useNavigate|useLocation/);
});

test('chapter loading adapts the chapter entity public API without owning HTTP', async () => {
  const source = await readFile(
    'apps/web/src/features/read-chapter/lib/chapter-loader-adapter.ts',
    'utf8'
  );
  assert.match(source, /getChapter/);
  assert.match(source, /ReaderChapterLoader/);
  assert.match(source, /contentVersion/);
  assert.doesNotMatch(source, /shared\/api|\bhttp\s*\(|fetch\s*\(/);
});

test('reader persistence and browser globals remain outside the package', async () => {
  const engine = await readTree('packages/reader-engine/src');
  const feature = await readTree('apps/web/src/features/read-chapter');
  assert.doesNotMatch(engine, /indexedDB|localStorage|navigator|\bdocument\b/);
  assert.match(feature, /indexedDB/);
  assert.match(feature, /localStorage/);
  assert.match(feature, /navigator/);
});

test('persistent reader cache preserves version invalidation bounded pruning and quota retry', async () => {
  const source = await readFile(
    'apps/web/src/features/read-chapter/lib/indexeddb-reader-cache.ts',
    'utf8'
  );
  assert.match(source, /DB_VERSION\s*=\s*\d+/);
  assert.match(source, /MAX_DISK_CHAPTERS\s*=\s*200/);
  assert.match(source, /contentVersion/);
  assert.match(source, /QuotaExceededError/);
  assert.match(source, /prune/);
  assert.match(source, /Math\.floor\(MAX_DISK_CHAPTERS \* 0\.75\)/);
});

test('reading adapters retain anchor position continuity and navigation acceptance behavior', async () => {
  const source = await readTree('apps/web/src/features/read-chapter');
  assert.match(source, /data-reader-paragraph/);
  assert.match(source, /paragraphOffset/);
  assert.match(source, /scrollRatio/);
  assert.match(source, /schemaVersion:\s*1/);
  assert.match(source, /novel-tool-reader-history/);
  assert.match(source, /novel-tool-reader-bookmarks/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /touchstart/);
  assert.match(source, /touchend/);
});

test('reader preferences own storage DOM attributes and reader theme CSS', async () => {
  const source = await readTree('apps/web/src/features/reader-preferences');
  assert.match(source, /novel-tool-reader/);
  for (const attribute of [
    'readerFont',
    'readerLine',
    'readerParagraph',
    'readerFamily',
    'readerWeight',
    'readerMargin',
    'readerAlign',
    'readerIndent',
    'readerHyphen',
    'readerDropcap',
    'readerTheme'
  ]) {
    assert.match(source, new RegExp(attribute));
  }
  assert.match(source, /--reader-dim-opacity/);
  assert.match(source, /reader-theme\.css/);
  assert.match(source, /\.reader-content/);
  assert.match(source, /\[data-reader-theme=['"]sepia['"]\]/);
  assert.match(source, /:root\[data-reader-theme=['"]sepia['"]\]\s+\.reader-surface/);
  assert.match(source, /motion-reader/);
});

test('reader action slices expose only public APIs and feature-owned CSS', async () => {
  const readChapter = await readFile('apps/web/src/features/read-chapter/index.ts', 'utf8');
  const preferences = await readFile('apps/web/src/features/reader-preferences/index.ts', 'utf8');
  const selectChapter = await readFile('apps/web/src/features/select-chapter/index.ts', 'utf8');
  assert.match(readChapter, /useReaderController/);
  assert.match(readChapter, /IndexedDbReaderChapterCache/);
  assert.match(readChapter, /useReaderProgress/);
  assert.match(preferences, /ReaderPreferencesProvider/);
  assert.match(preferences, /ReaderPreferencesSheet/);
  assert.match(preferences, /reader-theme\.css/);
  assert.match(selectChapter, /ChapterListSheet/);
});

test('canonical web declares its reader-engine workspace dependency', async () => {
  const packageJson = JSON.parse(await readFile('apps/web/package.json', 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  assert.equal(packageJson.dependencies?.['@novel-tool/reader-engine'], '3.0.0');
});

test('reader preference normalization rejects invalid stored values and clamps brightness', async () => {
  const { normalizeReaderPreferences } =
    await import('../../apps/web/src/features/reader-preferences/model/preferences.ts');
  assert.deepEqual(
    normalizeReaderPreferences({
      fontSize: 'huge',
      lineHeight: 'relaxed',
      paragraphSpacing: 'wide',
      fontFamily: 'sans',
      brightness: 37,
      indent: true
    }),
    {
      fontSize: 'medium',
      lineHeight: 'relaxed',
      paragraphSpacing: 'wide',
      fontFamily: 'sans',
      fontWeight: 'regular',
      pageMargin: 'normal',
      alignment: 'left',
      indent: true,
      hyphenation: false,
      dropCap: false,
      keepAwake: false,
      colorScheme: 'system',
      brightness: 45
    }
  );

  assert.equal(normalizeReaderPreferences({ brightness: Number.NaN }).brightness, 100);
});
