import assert from 'node:assert/strict';
import test from 'node:test';
import { ModuleRegistry } from '../../apps/api/src/bootstrap/module-registry.ts';
import type { BackupContributor } from '../../apps/api/src/platform/backup/backup-contributor.ts';

test('module registry exposes module-owned backup contributors in registration order', () => {
  const first: BackupContributor = {
    module: 'first',
    fingerprintTables: ['first_table'],
    exportMergeData: () => Promise.resolve({}),
    importMergeData: () => Promise.resolve({ module: 'first', counts: {} })
  };
  const second: BackupContributor = {
    module: 'second',
    fingerprintTables: ['second_table'],
    exportMergeData: () => Promise.resolve({}),
    importMergeData: () => Promise.resolve({ module: 'second', counts: {} })
  };
  const registry = new ModuleRegistry();
  registry.register(
    { name: 'first', migrations: [], backup: first },
    { name: 'without-backup', migrations: [] },
    { name: 'second', migrations: [], backup: second }
  );

  assert.deepEqual(registry.backupContributors(), [first, second]);
});
