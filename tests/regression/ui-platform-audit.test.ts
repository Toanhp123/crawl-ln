import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('mobile navigation uses the compact design token', () => {
  assert.match(read('apps/web/src/shared/theme/size.css'), /--height-bottom-nav:\s*3\.5rem/);
});

test('cards and bottom navigation avoid heavy elevation', () => {
  assert.doesNotMatch(read('apps/web/src/shared/ui/layout/Card.tsx'), /shadow-soft/);
  assert.doesNotMatch(read('apps/web/src/shared/ui/navigation/BottomNav.tsx'), /elevation-3/);
});

test('status badges use semantic borders with theme-tuned subtle fills', () => {
  const source = read('apps/web/src/shared/ui/data-display/Chip.tsx');
  const badge = read('apps/web/src/shared/ui/feedback/Badge.tsx');
  assert.match(source, /border-success-state-border bg-success-subtle/);
  assert.match(source, /border-warning-state-border bg-warning-subtle/);
  assert.match(source, /border-danger-state-border bg-danger-subtle/);
  assert.match(source, /border-info-state-border bg-info-subtle/);
  assert.match(badge, /<Chip/);
  assert.doesNotMatch(source, /hsl\(var\(--color-(?:success|warning|danger|info)\)\s*\//);
});

test('global add flow keeps task progress out of the add sheet', () => {
  const overlay = read('apps/web/src/app/layouts/GlobalAddNovelOverlay.tsx');
  assert.match(overlay, /globalAdd\.description/);
  assert.match(overlay, /globalAdd\.queuedDescription/);
  assert.doesNotMatch(overlay, /ImportProgressCard|ImportTimeline|getTaskEvents/);
});

test('chapter, novel and task statuses use localized labels', () => {
  assert.match(
    read('apps/web/src/entities/chapter/ui/ChapterList.tsx'),
    /status\(chapter\.status\)/
  );
  assert.match(
    read('apps/web/src/entities/novel/ui/NovelLibraryCard.tsx'),
    /status\(novel\.status\)/
  );
  assert.match(
    read('apps/web/src/widgets/crawl-task-card/ui/CrawlTaskCard.tsx'),
    /status\(task\.status\)/
  );
});

test('shared controls avoid hard-coded Vietnamese accessibility and pagination copy', () => {
  for (const path of [
    'apps/web/src/shared/ui/data-display/Pagination.tsx',
    'apps/web/src/shared/ui/overlay/Modal.tsx',
    'apps/web/src/shared/ui/overlay/Drawer.tsx',
    'apps/web/src/shared/ui/forms/SearchInput.tsx'
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /Đóng|Trước|Sau|Xóa tìm kiếm/);
  }
});

test('reanalyze reconciles chapters by canonical source URL and preserves stable identities', () => {
  assert.match(
    read('apps/api/src/modules/novels/application/use-cases/analyze-novel.usecase.ts'),
    /existingByUrl/
  );
  assert.match(
    read('apps/api/src/modules/novels/infrastructure/sqlite/novel-analysis-sqlite.adapter.ts'),
    /findBySourceUrl/
  );
  assert.doesNotMatch(
    read('apps/api/src/modules/novels/infrastructure/sqlite/novel-sqlite.repository.ts'),
    /chapters|crawl_tasks/
  );
});

test('i18n dictionaries have compile-time parity and shared UI uses semantic colors', () => {
  const provider = read('apps/web/src/shared/i18n/I18nProvider.tsx');
  const vi = read('apps/web/src/shared/i18n/locales/vi.ts');
  assert.match(provider, /TranslationKey = keyof typeof en/);
  assert.match(vi, /Record<keyof typeof en, string>/);
  for (const path of [
    'apps/web/src/shared/ui/feedback/ErrorBanner.tsx',
    'apps/web/src/shared/ui/actions/Button.tsx',
    'apps/web/src/shared/ui/actions/IconButton.tsx',
    'apps/web/src/entities/chapter/ui/ChapterList.tsx'
  ])
    assert.doesNotMatch(
      read(path),
      /(?:red|blue|green|gray|zinc|slate|emerald|amber|violet|indigo)-(?:50|100|200|300|400|500|600|700|800|900)/
    );
});

test('settings exposes theme, language and reader preferences', () => {
  const source = [
    read('apps/web/src/pages/settings/model/useSettingsPage.tsx'),
    read('apps/web/src/pages/settings/ui/SettingsPage.tsx'),
    read('apps/web/src/pages/settings/ui/ReaderSettingsControls.tsx')
  ].join('\n');
  assert.match(source, /settings\.appearance/);
  assert.match(source, /settings\.language/);
  assert.match(source, /settings\.fontSize/);
  assert.match(source, /settings\.lineHeight/);
  assert.match(source, /settings\.paragraphSpacing/);
});

test('reader fallback titles and paragraph layout are localized and token driven', () => {
  const source = read('apps/web/src/entities/chapter/ui/ChapterReader.tsx');
  assert.doesNotMatch(source, /`Chapter \$\{chapter\.index\}`/);
  assert.match(source, /reader-paragraph-gap/);
  assert.match(source, /splitChapterParagraphs/);
  assert.doesNotMatch(source, /text-\[hsl\(var\(--color-text-secondary\)\)\]/);
});

test('theme and language bootstrap apply before React mounts', () => {
  const source = read('apps/web/index.html');
  assert.match(source, /meta\[name="theme-color"\]/);
  assert.match(source, /novel-tool-language/);
  assert.match(source, /document\.documentElement\.lang/);
});

test('runtime theme updates browser chrome color', () => {
  const source = read('apps/web/src/shared/theme/runtime/ThemeProvider.tsx');
  assert.match(source, /theme-color/);
  assert.match(source, /setAttribute\('content'/);
});

test('technical errors are translated by stable error codes', () => {
  assert.match(read('apps/web/src/shared/i18n/I18nProvider.tsx'), /errorMessage:/);
  assert.match(
    read('apps/web/src/entities/chapter/ui/ChapterList.tsx'),
    /errorMessage\(chapter\.errorMessage/
  );
  assert.doesNotMatch(read('apps/web/src/shared/api/errors.ts'), /fallback = 'Request failed\.'/);
});

test('settings uses localized language labels and shared size typography tokens', () => {
  const source = [
    read('apps/web/src/pages/settings/model/useSettingsPage.tsx'),
    read('apps/web/src/pages/settings/ui/SettingRow.tsx')
  ].join('\n');
  assert.doesNotMatch(source, /label: 'English'|label: 'Tiếng Việt'/);
  assert.doesNotMatch(source, /min-h-\[2\.875rem\]|min-h-\[3\.25rem\]|tracking-\[0\.12em\]/);
});

test('appearance bootstrap and runtime support accent and density', () => {
  const html = read('apps/web/index.html');
  const provider = read('apps/web/src/shared/theme/runtime/ThemeProvider.tsx');
  assert.match(html, /novel-tool-accent/);
  assert.match(html, /novel-tool-density/);
  assert.match(provider, /AccentPreference/);
  assert.match(provider, /DensityPreference/);
  assert.match(provider, /dataset\.accent/);
  assert.match(provider, /dataset\.density/);
});

test('reader pro exposes typography, layout, wake lock and gesture controls', () => {
  const settings = [
    read('apps/web/src/pages/settings/model/useSettingsPage.tsx'),
    read('apps/web/src/pages/settings/ui/ReaderSettingsControls.tsx')
  ].join('\n');
  const page = [
    read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx'),
    read('apps/web/src/pages/chapter-reader/model/useReaderWakeLock.ts')
  ].join('\n');
  const reader = read('apps/web/src/entities/chapter/ui/ChapterReader.tsx');
  const toolbar = read('apps/web/src/widgets/reader-toolbar/ui/ReaderToolbar.tsx');
  for (const key of [
    'fontFamily',
    'fontWeight',
    'pageMargin',
    'alignment',
    'indent',
    'hyphenation',
    'dropCap',
    'keepAwake'
  ])
    assert.match(settings, new RegExp(key));
  assert.match(page, /wakeLock/);
  assert.match(page, /ReaderBottomBar/);
  assert.match(toolbar, /ArrowLeft/);
  assert.match(page, /setChrome/);
  assert.match(reader, /estimateReadingMinutes/);
});

test('mobile overlays and export use accessible bottom-sheet patterns', () => {
  assert.match(read('apps/web/src/features/export-novel/ui/ExportMenu.tsx'), /BottomSheet/);
  assert.match(read('apps/web/src/shared/ui/overlay/BottomSheet.tsx'), /Dialog\.Title/);
  assert.match(read('apps/web/src/shared/ui/feedback/Toast.tsx'), /ToastPrimitive\.Close/);
  assert.match(read('apps/web/src/shared/ui/feedback/Toast.tsx'), /common\.notifications/);
});

test('typed i18n provides number date relative time and plural helpers', () => {
  const source = read('apps/web/src/shared/i18n/I18nProvider.tsx');
  assert.match(source, /Intl\.NumberFormat/);
  assert.match(source, /Intl\.DateTimeFormat/);
  assert.match(source, /Intl\.RelativeTimeFormat/);
  assert.match(source, /plural:/);
});

test('product pages expose native library controls and compact crawl help', () => {
  assert.match(
    read('apps/web/src/features/filter-library/ui/LibraryControlsSheet.tsx'),
    /library\.sort/
  );
  assert.match(
    read('apps/web/src/features/filter-library/ui/LibraryControlsSheet.tsx'),
    /library\.filter/
  );
  assert.match(read('apps/web/src/app/layouts/GlobalAddNovelOverlay.tsx'), /globalAdd\.advanced/);
  assert.doesNotMatch(read('apps/web/src/app/layouts/GlobalAddNovelOverlay.tsx'), /benefits\.map/);
});

test('context providers are ordered so ToastProvider can access i18n', () => {
  const main = read('apps/web/src/main.tsx');
  const i18nOpen = main.indexOf('<I18nProvider>');
  const queryOpen = main.indexOf('<QueryProvider>');
  const queryClose = main.indexOf('</QueryProvider>');
  const i18nClose = main.indexOf('</I18nProvider>');

  assert.ok(i18nOpen >= 0 && queryOpen >= 0 && queryClose >= 0 && i18nClose >= 0);
  assert.ok(
    i18nOpen < queryOpen,
    'I18nProvider must wrap QueryProvider because QueryProvider mounts ToastProvider'
  );
  assert.ok(queryClose < i18nClose, 'QueryProvider must close before I18nProvider');
});

test('web shell declares an existing favicon asset', () => {
  const html = read('apps/web/index.html');
  assert.match(html, /<link rel="icon" href="\/favicon\.svg"/);
  assert.match(read('apps/web/public/favicon.svg'), /<svg/);
});
