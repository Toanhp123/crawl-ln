import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

const featureRoot = 'apps/web/src/features';
const slices = [
  'update-auto-update',
  'run-scheduler',
  'search-library',
  'rebuild-search-index',
  'export-novel',
  'backup-library',
  'configure-appearance',
  'configure-language'
] as const;

async function readTree(
  directory: string,
  root = directory,
  excluded = new Set<string>()
): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = join(directory, entry.name);
    const relativePath = relative(root, target);
    if (excluded.has(relativePath)) continue;
    if (entry.isDirectory()) parts.push(await readTree(target, root, excluded));
    else parts.push(`\n/* ${relativePath} */\n${await readFile(target, 'utf8')}`);
  }
  return parts.join('\n');
}

test('binary features preserve response filenames, content, and invalid empty-response semantics', async () => {
  const { createExportClient } = await import('../../apps/web/src/features/export-novel/index.ts');
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createExportClient(async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'content-disposition': 'attachment; filename="book.epub"',
        'content-type': 'application/epub+zip'
      }
    });
  });

  const artifact = await client.download({
    novelId: 'novel/1',
    format: 'epub',
    downloadedOnly: true
  });
  assert.equal(artifact.filename, 'book.epub');
  assert.equal(artifact.contentType, 'application/epub+zip');
  assert.deepEqual([...artifact.content], [1, 2, 3]);
  assert.deepEqual(
    requests.map(({ url, init }) => ({
      path: new URL(url).pathname,
      method: init?.method,
      body: init?.body
    })),
    [
      {
        path: '/api/exports/novels/novel%2F1',
        method: 'POST',
        body: JSON.stringify({ format: 'epub', downloadedOnly: true })
      }
    ]
  );

  const emptyClient = createExportClient(async () => new Response(null, { status: 204 }));
  await assert.rejects(
    () => emptyClient.download({ novelId: 'novel-1', format: 'txt', downloadedOnly: true }),
    /binary download|HTTP 204/i
  );
});

test('scheduler, search rebuild, and backup clients preserve current mutation contracts', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const path = new URL(String(input)).pathname;
    if (path === '/api/backups') {
      return new Response(new Uint8Array([9, 8, 7]), {
        status: 200,
        headers: {
          'content-disposition': 'attachment; filename="library.nvt"',
          'content-type': 'application/vnd.novel-tool.backup'
        }
      });
    }
    const data =
      path === '/api/search/rebuild'
        ? { indexedDocuments: 12 }
        : path === '/api/backups/restore'
          ? { mode: 'merge', restored: { novels: 1 }, settings: null, safetyBackupPath: null }
          : path.includes('/auto-update')
            ? { id: 'novel-1', title: 'Book' }
            : {
                running: false,
                tickIntervalMs: 60_000,
                monitoredNovels: 1,
                dueNovels: 0,
                activeRuns: 0
              };
    return new Response(JSON.stringify({ data, error: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const { updateAutoUpdate } =
      await import('../../apps/web/src/features/update-auto-update/api/update-auto-update.ts');
    const { runScheduler } =
      await import('../../apps/web/src/features/run-scheduler/api/run-scheduler.ts');
    const { rebuildSearchIndex } =
      await import('../../apps/web/src/features/rebuild-search-index/api/rebuild-search-index.ts');
    const { createLibraryBackup, restoreLibraryBackup } =
      await import('../../apps/web/src/features/backup-library/api/backup-library.ts');

    await updateAutoUpdate({ novelId: 'novel/1', enabled: true, intervalMinutes: 360 });
    await runScheduler();
    assert.deepEqual(await rebuildSearchIndex(), { indexedDocuments: 12 });
    const artifact = await createLibraryBackup({
      password: 'secret',
      settings: { 'novel-tool-theme': 'dark' }
    });
    assert.equal(artifact.filename, 'library.nvt');
    assert.deepEqual([...artifact.content], [9, 8, 7]);
    assert.deepEqual(
      await restoreLibraryBackup({
        content: new Blob([new Uint8Array([9, 8, 7])]),
        password: 'secret',
        mode: 'merge',
        settingsMode: 'keep-current',
        currentSettings: { 'novel-tool-theme': 'light' }
      }),
      { mode: 'merge', restored: { novels: 1 }, settings: null, safetyBackupPath: null }
    );
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.deepEqual(
    requests.map(({ url, init }) => ({
      path: new URL(url).pathname,
      method: init?.method,
      contentType: new Headers(init?.headers).get('content-type'),
      restoreMode: new Headers(init?.headers).get('x-restore-mode'),
      settingsMode: new Headers(init?.headers).get('x-settings-mode'),
      hasPassword: new Headers(init?.headers).get('x-backup-password') === 'secret',
      body: typeof init?.body === 'string' ? init.body : undefined
    })),
    [
      {
        path: '/api/novels/novel%2F1/auto-update',
        method: 'PUT',
        contentType: 'application/json',
        restoreMode: null,
        settingsMode: null,
        hasPassword: false,
        body: JSON.stringify({ enabled: true, intervalMinutes: 360 })
      },
      {
        path: '/api/scheduler/tick',
        method: 'POST',
        contentType: 'application/json',
        restoreMode: null,
        settingsMode: null,
        hasPassword: false,
        body: undefined
      },
      {
        path: '/api/search/rebuild',
        method: 'POST',
        contentType: 'application/json',
        restoreMode: null,
        settingsMode: null,
        hasPassword: false,
        body: undefined
      },
      {
        path: '/api/backups',
        method: 'POST',
        contentType: 'application/json',
        restoreMode: null,
        settingsMode: null,
        hasPassword: false,
        body: JSON.stringify({ password: 'secret', settings: { 'novel-tool-theme': 'dark' } })
      },
      {
        path: '/api/backups/restore',
        method: 'POST',
        contentType: 'application/octet-stream',
        restoreMode: 'merge',
        settingsMode: 'keep-current',
        hasPassword: true,
        body: undefined
      }
    ]
  );
});

test('backup restore validation and settings helpers remain feature-owned', async () => {
  const backup = await import('../../apps/web/src/features/backup-library/index.ts');
  assert.equal(backup.requiresRestoreConfirmation('replace'), true);
  assert.equal(backup.requiresRestoreConfirmation('merge'), true);
  assert.deepEqual(
    backup.validateRestoreResult({
      mode: 'replace',
      restored: { novels: 2 },
      settings: { 'novel-tool-language': 'vi' },
      safetyBackupPath: '/tmp/safety.nvt'
    }),
    {
      mode: 'replace',
      restored: { novels: 2 },
      settings: { 'novel-tool-language': 'vi' },
      safetyBackupPath: '/tmp/safety.nvt'
    }
  );
  assert.throws(
    () => backup.validateRestoreResult({ mode: 'replace', restored: null }),
    /invalid backup restore response/i
  );

  const storage = new Map<string, string>([
    ['novel-tool-theme', 'dark'],
    ['novel-tool-language', 'vi'],
    ['unrelated', 'ignore']
  ]);
  const localStorageLike = {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    }
  };
  assert.deepEqual(backup.collectBackupSettings(localStorageLike), {
    'novel-tool-theme': 'dark',
    'novel-tool-language': 'vi'
  });
  backup.applyBackupSettings(
    { 'novel-tool-theme': 'light', unrelated: 'ignored' },
    localStorageLike
  );
  assert.equal(storage.get('novel-tool-theme'), 'light');
  assert.equal(storage.get('unrelated'), 'ignore');
});

test('search and settings controls consume public entity/provider commands', async () => {
  const searchSource = await readTree(join(featureRoot, 'search-library'));
  assert.match(searchSource, /useLibrarySearch/);
  assert.doesNotMatch(searchSource, /from ['"]@tanstack\/react-query['"]/);

  const appearanceSource = await readTree(join(featureRoot, 'configure-appearance'));
  assert.match(appearanceSource, /useAppTheme/);
  assert.doesNotMatch(appearanceSource, /localStorage|document\.documentElement/);

  const languageSource = await readTree(join(featureRoot, 'configure-language'));
  assert.match(languageSource, /useI18n/);
  assert.doesNotMatch(languageSource, /localStorage|document\.documentElement/);
});

test('Task 7 feature public APIs expose actions and reusable controls', async () => {
  const autoUpdate = await import('../../apps/web/src/features/update-auto-update/index.ts');
  const scheduler = await import('../../apps/web/src/features/run-scheduler/index.ts');
  const search = await import('../../apps/web/src/features/search-library/index.ts');
  const rebuild = await import('../../apps/web/src/features/rebuild-search-index/index.ts');
  const exportNovel = await import('../../apps/web/src/features/export-novel/index.ts');
  const backup = await import('../../apps/web/src/features/backup-library/index.ts');
  const appearance = await import('../../apps/web/src/features/configure-appearance/index.ts');
  const language = await import('../../apps/web/src/features/configure-language/index.ts');

  assert.equal(typeof autoUpdate.useUpdateAutoUpdate, 'function');
  assert.equal(typeof autoUpdate.AutoUpdateControl, 'function');
  assert.equal(typeof scheduler.useRunScheduler, 'function');
  assert.equal(typeof scheduler.RunSchedulerButton, 'function');
  assert.equal(typeof search.useSearchLibraryFeature, 'function');
  assert.equal(typeof search.LibrarySearchPanel, 'function');
  assert.equal(typeof rebuild.useRebuildSearchIndex, 'function');
  assert.equal(typeof rebuild.RebuildSearchIndexButton, 'function');
  assert.equal(typeof exportNovel.createExportClient, 'function');
  assert.equal(typeof exportNovel.useExportNovel, 'function');
  assert.equal(typeof exportNovel.ExportNovelControl, 'function');
  assert.equal(typeof backup.createBackupClient, 'function');
  assert.equal(typeof backup.BackupLibraryPanel, 'function');
  assert.equal(typeof appearance.useAppearanceConfiguration, 'function');
  assert.equal(typeof appearance.AppearanceControls, 'function');
  assert.equal(typeof language.useLanguageConfiguration, 'function');
  assert.equal(typeof language.LanguageControls, 'function');

  for (const slice of slices) {
    assert.equal((await stat(join(featureRoot, slice, 'index.ts'))).isFile(), true);
  }
});

test('pages and entities do not own Task 7 mutations or provider state transitions', async () => {
  const upperLayers = [
    await readTree('apps/web/src/app', undefined, new Set([join('i18n', 'catalog.ts')])),
    await readTree('apps/web/src/pages'),
    await readTree('apps/web/src/entities')
  ].join('\n');
  assert.doesNotMatch(
    upperLayers,
    /useMutation|runScheduler|restoreLibraryBackup|rebuildSearchIndex|updateAutoUpdate|setTheme|setLanguage|method:\s*['"](?:POST|PUT|PATCH|DELETE)/
  );

  const task7Source = (
    await Promise.all(slices.map((slice) => readTree(join(featureRoot, slice))))
  ).join('\n');
  assert.doesNotMatch(
    task7Source,
    /features\/(?:update-auto-update|run-scheduler|search-library|rebuild-search-index|export-novel|backup-library|configure-appearance|configure-language)\//
  );
  assert.match(task7Source, /schedulerInvalidation/);
  assert.match(task7Source, /searchInvalidation/);

  const backupPanel = await readFile(
    join(featureRoot, 'backup-library', 'ui', 'BackupLibraryPanel.tsx'),
    'utf8'
  );
  assert.match(backupPanel, /<ConfirmDialog[\s\S]*actionState=\{restoreBackup\.status\}/);
  assert.match(backupPanel, /<ConfirmDialog[\s\S]*danger=\{mode === ['"]replace['"]\}/);
});
