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

test('installed package removal rejects unsafe plugin ids without touching outside paths', async (t) => {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'source-plugin-removal-safe-'));
  t.after(() => rm(pluginRoot, { recursive: true, force: true }));
  const service = installationService(pluginRoot);

  await assert.rejects(() => service.removeInstalled('../outside'), /Invalid source plugin id/);
  await assert.doesNotReject(() => access(pluginRoot));
});
