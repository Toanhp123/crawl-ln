import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PluginInstallationService } from '../../apps/api/src/modules/source-reader/application/admin/services/plugin-installation.service.ts';
import { RemovePluginUseCase } from '../../apps/api/src/modules/source-reader/application/admin/use-cases/plugins/manage-source-plugins.usecase.ts';

const actor = { id: 'user-1', roles: ['source-admin'] as const };
const manifest = {
  id: 'novelcool',
  name: 'NovelCool',
  version: '2.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['metadata'],
  contracts: { metadata: 1 },
  matchers: [{ hosts: ['novelcool.com'], priority: 100 }],
  runtime: { preferredMode: 'isolated' },
  permissions: { network: { hosts: ['novelcool.com'] } }
} as const;

function installationService(pluginRoot: string) {
  let id = 0;
  return new PluginInstallationService(
    {
      verify: async () => ({
        manifest,
        files: new Map([
          ['manifest.json', Buffer.from(JSON.stringify(manifest))],
          ['index.js', Buffer.from('export default {};')]
        ]),
        packageChecksum: 'checksum',
        signatureStatus: 'unsigned',
        trustLevel: 'local-unverified'
      })
    } as never,
    {
      recordInstallation: async () => undefined,
      upsertPluginVersion: async () => undefined,
      commitInstallation: async () => undefined,
      replaceRequestedPermissions: async () => undefined,
      findVersion: async () => undefined,
      quarantine: async () => undefined
    } as never,
    pluginRoot,
    { randomId: () => `installation-${++id}` },
    { now: () => new Date('2026-07-27T04:00:00.000Z') }
  );
}

test('plugin removal disables runtime and deletes installed files before persistence', async () => {
  const calls: string[] = [];
  const useCase = new RemovePluginUseCase(
    { requireRole: () => calls.push('authorize') } as never,
    { disable: async () => void calls.push('disable') },
    {
      findLatestVersion: async () => {
        calls.push('load');
        return { pluginId: 'novelcool' };
      },
      remove: async () => void calls.push('remove-records')
    } as never,
    { removeInstalled: async () => void calls.push('remove-files') },
    { invalidate: async () => void calls.push('invalidate') }
  );

  await useCase.execute({ actor: actor as never, pluginId: 'novelcool' });

  assert.deepEqual(calls, [
    'authorize',
    'load',
    'disable',
    'remove-files',
    'remove-records',
    'invalidate'
  ]);
});

test('failed installed-file cleanup leaves persistence available for uninstall retry', async () => {
  const calls: string[] = [];
  const useCase = new RemovePluginUseCase(
    { requireRole: () => calls.push('authorize') } as never,
    { disable: async () => void calls.push('disable') },
    {
      findLatestVersion: async () => {
        calls.push('load');
        return { pluginId: 'novelcool' };
      },
      remove: async () => void calls.push('remove-records')
    } as never,
    {
      removeInstalled: async () => {
        calls.push('remove-files');
        throw new Error('locked');
      }
    },
    { invalidate: async () => void calls.push('invalidate') }
  );

  await assert.rejects(
    () => useCase.execute({ actor: actor as never, pluginId: 'novelcool' }),
    /locked/
  );
  assert.deepEqual(calls, ['authorize', 'load', 'disable', 'remove-files']);
});

test('removing installed package files allows the same plugin version to be installed again', async (t) => {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'source-plugin-removal-'));
  t.after(() => rm(pluginRoot, { recursive: true, force: true }));
  const service = installationService(pluginRoot);
  const input = {
    bytes: new Uint8Array([1, 2, 3]),
    originalName: 'novelcool-2.0.0.source-plugin'
  };

  await service.install(input);
  await service.removeInstalled('novelcool');
  await service.install(input);

  assert.equal(
    await readFile(join(pluginRoot, 'installed', 'novelcool', '2.0.0', 'index.js'), 'utf8'),
    'export default {};'
  );
});

test('installing recovers an orphaned version directory left by the old uninstall flow', async (t) => {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'source-plugin-orphan-recovery-'));
  t.after(() => rm(pluginRoot, { recursive: true, force: true }));
  const service = installationService(pluginRoot);
  const input = {
    bytes: new Uint8Array([1, 2, 3]),
    originalName: 'novelcool-2.0.0.source-plugin'
  };

  await service.install(input);
  await service.install(input);

  assert.equal(
    await readFile(join(pluginRoot, 'installed', 'novelcool', '2.0.0', 'index.js'), 'utf8'),
    'export default {};'
  );
});

test('installing the same persisted plugin version replaces the previous package', async (t) => {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'source-plugin-version-replace-'));
  t.after(() => rm(pluginRoot, { recursive: true, force: true }));
  let installed = false;
  let build = 'first';
  let id = 0;
  const service = new PluginInstallationService(
    {
      verify: async () => ({
        manifest,
        files: new Map([
          ['manifest.json', Buffer.from(JSON.stringify(manifest))],
          ['index.js', Buffer.from(`export default '${build}';`)]
        ]),
        packageChecksum: `${build}-checksum`,
        signatureStatus: 'unsigned',
        trustLevel: 'local-unverified'
      })
    } as never,
    {
      recordInstallation: async () => undefined,
      upsertPluginVersion: async () => {
        installed = true;
      },
      commitInstallation: async () => {
        installed = true;
      },
      replaceRequestedPermissions: async () => undefined,
      findVersion: async () =>
        installed ? { pluginId: manifest.id, version: manifest.version } : undefined,
      quarantine: async () => undefined
    } as never,
    pluginRoot,
    { randomId: () => `installation-${++id}` },
    { now: () => new Date('2026-07-27T04:00:00.000Z') }
  );
  const input = {
    bytes: new Uint8Array([1, 2, 3]),
    originalName: 'novelcool-2.0.0.source-plugin'
  };

  await service.install(input);
  build = 'second';
  await service.install(input);

  assert.equal(
    await readFile(join(pluginRoot, 'installed', 'novelcool', '2.0.0', 'index.js'), 'utf8'),
    "export default 'second';"
  );
});

test('failed same-version commit restores the previous package and active runtime', async (t) => {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'source-plugin-version-rollback-'));
  t.after(() => rm(pluginRoot, { recursive: true, force: true }));
  let build = 'first';
  let commitCount = 0;
  let restoreCount = 0;
  let id = 0;
  const service = new PluginInstallationService(
    {
      verify: async () => ({
        manifest,
        files: new Map([
          ['manifest.json', Buffer.from(JSON.stringify(manifest))],
          ['index.js', Buffer.from(`export default '${build}';`)]
        ]),
        packageChecksum: `${build}-checksum`,
        signatureStatus: 'unsigned',
        trustLevel: 'local-unverified'
      })
    } as never,
    {
      recordInstallation: async () => undefined,
      commitInstallation: async () => {
        commitCount += 1;
        if (commitCount === 2) throw new Error('database commit failed');
      }
    } as never,
    pluginRoot,
    { randomId: () => `installation-${++id}` },
    { now: () => new Date('2026-07-27T04:00:00.000Z') },
    undefined,
    {
      beforeReplace: async () => ({
        restore: async () => {
          restoreCount += 1;
        }
      })
    }
  );
  const input = {
    bytes: new Uint8Array([1, 2, 3]),
    originalName: 'novelcool-2.0.0.source-plugin'
  };

  await service.install(input);
  build = 'second';
  await assert.rejects(() => service.install(input), /database commit failed/);

  assert.equal(
    await readFile(join(pluginRoot, 'installed', 'novelcool', '2.0.0', 'index.js'), 'utf8'),
    "export default 'first';"
  );
  assert.equal(restoreCount, 1);
});

test('failed runtime restoration is surfaced with the original installation failure', async (t) => {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'source-plugin-runtime-rollback-failure-'));
  t.after(() => rm(pluginRoot, { recursive: true, force: true }));
  let commitCount = 0;
  let id = 0;
  const service = new PluginInstallationService(
    {
      verify: async () => ({
        manifest,
        files: new Map([
          ['manifest.json', Buffer.from(JSON.stringify(manifest))],
          ['index.js', Buffer.from('export default {};')]
        ]),
        packageChecksum: 'checksum',
        signatureStatus: 'unsigned',
        trustLevel: 'local-unverified'
      })
    } as never,
    {
      recordInstallation: async () => undefined,
      commitInstallation: async () => {
        commitCount += 1;
        if (commitCount === 2) throw new Error('database commit failed');
      }
    } as never,
    pluginRoot,
    { randomId: () => `installation-${++id}` },
    { now: () => new Date('2026-07-27T04:00:00.000Z') },
    undefined,
    {
      beforeReplace: async () => ({
        restore: async () => {
          throw new Error('runtime restore failed');
        }
      })
    }
  );
  const input = {
    bytes: new Uint8Array([1, 2, 3]),
    originalName: 'novelcool-2.0.0.source-plugin'
  };

  await service.install(input);
  await assert.rejects(
    () => service.install(input),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map((cause) => (cause instanceof Error ? cause.message : String(cause))),
        ['database commit failed', 'runtime restore failed']
      );
      return true;
    }
  );
});

test('incompatible package without a fatal issue records the contract quarantine reason', async (t) => {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'source-plugin-quarantine-reason-'));
  t.after(() => rm(pluginRoot, { recursive: true, force: true }));
  let quarantineReason: string | undefined;
  const service = new PluginInstallationService(
    {
      verify: async () => ({
        manifest,
        files: new Map([['manifest.json', Buffer.from(JSON.stringify(manifest))]]),
        packageChecksum: 'checksum',
        signatureStatus: 'unsigned',
        trustLevel: 'local-unverified'
      })
    } as never,
    {
      recordInstallation: async () => undefined,
      commitInstallation: async (input: { quarantineReason?: string }) => {
        quarantineReason = input.quarantineReason;
      }
    } as never,
    pluginRoot,
    { randomId: () => 'installation-1' },
    { now: () => new Date('2026-07-27T04:00:00.000Z') },
    {
      evaluate: () => ({
        compatible: false,
        issues: [{ severity: 'warning', code: 'OPTIONAL_EXTENSION_UNAVAILABLE' }],
        activatedExtensions: {}
      })
    } as never
  );

  await service.install({
    bytes: new Uint8Array([1, 2, 3]),
    originalName: 'novelcool-2.0.0.source-plugin'
  });

  assert.equal(quarantineReason, 'PLUGIN_CONTRACT_INCOMPATIBLE');
});

test('installed package removal rejects unsafe plugin ids without touching outside paths', async (t) => {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'source-plugin-removal-safe-'));
  t.after(() => rm(pluginRoot, { recursive: true, force: true }));
  const service = installationService(pluginRoot);

  await assert.rejects(() => service.removeInstalled('../outside'), /Invalid source plugin id/);
  await assert.doesNotReject(() => access(pluginRoot));
});
