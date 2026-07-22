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
    localStorageLike
  );
  assert.equal(storage.get('novel-tool-reader'), '{"fontSize":20}');
  assert.equal(storage.get('unrelated'), 'ignore');
});

test('backup restore uses the shared maintenance boundary and reload contract', async () => {
  const [providers, backupHook, sharedMaintenance] = await Promise.all([
    readFile('apps/web/src/app/providers/AppProviders.tsx', 'utf8'),
    readFile('apps/web/src/features/backup-library/model/use-backup-library.ts', 'utf8'),
    readFile('apps/web/src/shared/maintenance/index.ts', 'utf8').catch(() => '')
  ]);

  assert.equal(existsSync('apps/web/src/app/providers/MaintenanceProvider.tsx'), false);
  assert.match(providers, /from ['"]@\/shared\/maintenance['"]/);
  assert.match(sharedMaintenance, /MaintenanceProvider/);
  assert.match(backupHook, /useMaintenanceOperation/);
  assert.match(backupHook, /runMaintenance/);
  assert.match(backupHook, /reloadOnSuccess:\s*true/);
});
