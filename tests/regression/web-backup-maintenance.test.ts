import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('backup settings round-trip the reader preference namespace', async () => {
  const { applyBackupSettings, collectBackupSettings } =
    await import('../../apps/web/src/features/backup-library/lib/settings.ts');
  const storage = new Map<string, string>([
    ['novel-tool-theme', 'dark'],
    ['novel-tool-reader', '{"fontSize":18}'],
    ['unrelated', 'ignore']
  ]);
  const events: Event[] = [];
  const localStorageLike = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  };

  assert.deepEqual(collectBackupSettings(localStorageLike), {
    'novel-tool-theme': 'dark',
    'novel-tool-reader': '{"fontSize":18}'
  });
  applyBackupSettings(
    { 'novel-tool-reader': '{"fontSize":20}', unrelated: 'ignored' },
    localStorageLike,
    { dispatchEvent: (event) => (events.push(event), true) }
  );
  assert.equal(storage.get('novel-tool-reader'), '{"fontSize":20}');
  assert.equal(storage.get('unrelated'), 'ignore');
  assert.equal(events.length, 1);
});

test('Restore completion uses settings synchronization and a guarded Replace reload', async () => {
  const [wizardHook, wizard, settings, theme, i18n, reader] = await Promise.all([
    readFile('apps/web/src/features/backup-library/model/use-restore-wizard.ts', 'utf8'),
    readFile('apps/web/src/features/backup-library/ui/RestoreWizard.tsx', 'utf8'),
    readFile('apps/web/src/features/backup-library/lib/settings.ts', 'utf8'),
    readFile('apps/web/src/shared/theme/runtime/AppThemeProvider.tsx', 'utf8'),
    readFile('apps/web/src/shared/i18n/I18nProvider.tsx', 'utf8'),
    readFile('apps/web/src/features/reader-preferences/model/ReaderPreferencesProvider.tsx', 'utf8')
  ]);

  assert.equal(existsSync('apps/web/src/app/providers/MaintenanceProvider.tsx'), false);
  assert.match(settings, /BACKUP_SETTINGS_APPLIED_EVENT/);
  assert.match(wizardHook, /replaceReloadedOperationId/);
  assert.match(wizard, /window\.location\.reload/);
  for (const provider of [theme, i18n, reader]) {
    assert.match(provider, /BACKUP_SETTINGS_APPLIED_EVENT/);
  }
});

test('final Restore uses preparation and operation endpoints without the compatibility endpoint', async () => {
  const [panel, api, commands, wizard] = await Promise.all([
    readFile('apps/web/src/features/backup-library/ui/BackupLibraryPanel.tsx', 'utf8'),
    readFile('apps/web/src/features/backup-library/api/backup-library.ts', 'utf8'),
    readFile('apps/web/src/features/backup-library/api/backup-operation-commands.ts', 'utf8'),
    readFile('apps/web/src/features/backup-library/ui/RestoreWizard.tsx', 'utf8')
  ]);

  assert.match(panel, /<BackupCreateFlow/);
  assert.match(panel, /<RestoreWizard/);
  assert.match(api, /\/api\/backups\/restore-sessions/);
  assert.match(commands, /restore-sessions\/\$\{encodeURIComponent\(sessionId\)\}\/restore/);
  assert.match(wizard, /useRestoreWizard/);
  assert.doesNotMatch(`${panel}\n${api}\n${commands}`, /\/api\/backups\/restore['"`]/);
  assert.doesNotMatch(panel, /LegacyRestoreCard|ConfirmDialog/);
});
