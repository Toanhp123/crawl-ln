import assert from 'node:assert/strict';
import test from 'node:test';
import { SourcePluginUsageGuardService } from '../../apps/api/src/modules/source-reader/application/admin/services/source-plugin-usage-guard.service.ts';
import { ActivePluginReplacementService } from '../../apps/api/src/modules/source-reader/application/admin/services/active-plugin-replacement.service.ts';
import {
  DenyPluginPermissionsUseCase,
  DisablePluginUseCase,
  RemovePluginUseCase
} from '../../apps/api/src/modules/source-reader/application/admin/use-cases/plugins/manage-source-plugins.usecase.ts';

const actor = { id: 'user-1', roles: ['source-admin'] as const };
const manifest = {
  id: 'novelcool',
  name: 'NovelCool',
  version: '2.0.0',
  engines: { sourceReader: '^3.0.0' },
  capabilities: ['chapter-content'],
  contracts: { 'chapter-content': 1 },
  matchers: [{ hosts: ['novelcool.com'], include: ['/chapter/**'], priority: 100 }],
  runtime: { preferredMode: 'isolated' },
  permissions: { network: { hosts: ['novelcool.com'] } }
} as const;

function storedPlugin(version = '2.0.0') {
  return {
    pluginId: 'novelcool',
    version,
    trustLevel: 'local-unverified',
    status: 'active',
    packagePath: '/plugins/novelcool',
    checksum: 'checksum',
    signatureStatus: 'unsigned',
    manifest: { ...manifest, version }
  } as const;
}

test('disable is rejected before runtime shutdown when a matching crawl job is active', async () => {
  const calls: string[] = [];
  const guard = new SourcePluginUsageGuardService(
    {
      listPotentialUsages: async (operation) => {
        calls.push(`usage:${operation}`);
        return [
          {
            jobId: 'job-1',
            novelId: 'novel-1',
            status: 'running',
            sourceUrls: ['https://novelcool.com/chapter/Chapter-1/1001/']
          }
        ];
      }
    },
    {
      findActive: async () => storedPlugin(),
      findLatestVersion: async () => storedPlugin()
    }
  );
  const useCase = new DisablePluginUseCase(
    { requireRole: () => calls.push('authorize') } as never,
    { disable: async () => void calls.push('disable') },
    { invalidate: async () => void calls.push('invalidate') },
    guard
  );

  await assert.rejects(
    () => useCase.execute({ actor, pluginId: 'novelcool' }),
    (error: unknown) => {
      const conflict = error as {
        kind?: string;
        details?: { reason?: string; operation?: string; blockingJobCount?: number };
      };
      assert.equal(conflict.kind, 'conflict');
      assert.equal(conflict.details?.reason, 'SOURCE_PLUGIN_IN_USE');
      assert.equal(conflict.details?.operation, 'disable');
      assert.equal(conflict.details?.blockingJobCount, 1);
      return true;
    }
  );
  assert.deepEqual(calls, ['authorize', 'usage:disable']);
});

test('disable proceeds when only paused jobs are returned outside the disable scope', async () => {
  const calls: string[] = [];
  const guard = new SourcePluginUsageGuardService(
    {
      listPotentialUsages: async (operation) => {
        calls.push(`usage:${operation}`);
        return [];
      }
    },
    {
      findActive: async () => storedPlugin(),
      findLatestVersion: async () => storedPlugin()
    }
  );
  const useCase = new DisablePluginUseCase(
    { requireRole: () => calls.push('authorize') } as never,
    { disable: async () => void calls.push('disable') },
    { invalidate: async () => void calls.push('invalidate') },
    guard
  );

  await useCase.execute({ actor, pluginId: 'novelcool' });
  assert.deepEqual(calls, ['authorize', 'usage:disable', 'disable', 'invalidate']);
});

test('deny is rejected before permissions or runtime change when an unfinished task uses the active version', async () => {
  const calls: string[] = [];
  const guard = new SourcePluginUsageGuardService(
    {
      listPotentialUsages: async (operation) => {
        calls.push(`usage:${operation}`);
        return [
          {
            jobId: 'job-paused',
            novelId: 'novel-1',
            status: 'paused',
            sourceUrls: ['https://novelcool.com/chapter/Chapter-1/1001/']
          }
        ];
      }
    },
    {
      findActive: async () => storedPlugin(),
      findLatestVersion: async () => storedPlugin()
    }
  );
  const useCase = new DenyPluginPermissionsUseCase(
    { requireRole: () => calls.push('authorize') } as never,
    {
      findActive: async () => {
        calls.push('load-active');
        return storedPlugin();
      },
      denyPermissions: async () => void calls.push('deny')
    },
    { disable: async () => void calls.push('disable') },
    { invalidate: async () => void calls.push('invalidate') },
    guard
  );

  await assert.rejects(
    () => useCase.execute({ actor, pluginId: 'novelcool', version: '2.0.0' }),
    (error: unknown) => {
      const conflict = error as {
        kind?: string;
        details?: { operation?: string; blockingJobs?: unknown[] };
      };
      assert.equal(conflict.kind, 'conflict');
      assert.equal(conflict.details?.operation, 'deny');
      assert.equal(conflict.details?.blockingJobs?.length, 1);
      return true;
    }
  );
  assert.deepEqual(calls, ['authorize', 'load-active', 'usage:deny']);
});

test('remove is rejected before runtime and filesystem changes when a paused job still depends on the plugin', async () => {
  const calls: string[] = [];
  const guard = new SourcePluginUsageGuardService(
    {
      listPotentialUsages: async (operation) => {
        calls.push(`usage:${operation}`);
        return [
          {
            jobId: 'job-paused',
            novelId: 'novel-1',
            status: 'paused',
            sourceUrls: ['https://novelcool.com/chapter/Chapter-1/1001/']
          }
        ];
      }
    },
    {
      findActive: async () => undefined,
      findLatestVersion: async () => storedPlugin()
    }
  );
  const useCase = new RemovePluginUseCase(
    { requireRole: () => calls.push('authorize') } as never,
    { disable: async () => void calls.push('disable') },
    {
      findLatestVersion: async () => {
        calls.push('load');
        return storedPlugin();
      },
      remove: async () => void calls.push('remove-records')
    } as never,
    { removeInstalled: async () => void calls.push('remove-files') },
    { invalidate: async () => void calls.push('invalidate') },
    guard
  );

  await assert.rejects(
    () => useCase.execute({ actor, pluginId: 'novelcool' }),
    (error: unknown) => {
      const conflict = error as { details?: { operation?: string; blockingJobs?: unknown[] } };
      assert.equal(conflict.details?.operation, 'remove');
      assert.equal(conflict.details?.blockingJobs?.length, 1);
      return true;
    }
  );
  assert.deepEqual(calls, ['authorize', 'load', 'usage:remove']);
});

test('usage guard ignores jobs whose chapter URLs do not match the plugin manifest', async () => {
  const guard = new SourcePluginUsageGuardService(
    {
      listPotentialUsages: async () => [
        {
          jobId: 'job-other',
          novelId: 'novel-other',
          status: 'running',
          sourceUrls: ['https://example.com/chapter/1']
        }
      ]
    },
    {
      findActive: async () => storedPlugin(),
      findLatestVersion: async () => storedPlugin()
    }
  );

  await assert.doesNotReject(() => guard.assertCanDisable('novelcool'));
});

test('replacing the active version uses the disable guard and can restore the previous runtime', async () => {
  const calls: string[] = [];
  const replacement = new ActivePluginReplacementService(
    { findActive: async () => storedPlugin() },
    { assertCanDisable: async () => void calls.push('guard') },
    {
      disable: async () => void calls.push('disable'),
      activate: async () => {
        calls.push('activate');
        return {};
      }
    },
    { invalidate: async (event) => void calls.push(`invalidate:${event.type}`) }
  );

  const suspended = await replacement.beforeReplace({
    pluginId: 'novelcool',
    version: '2.0.0'
  });
  await suspended?.restore();

  assert.deepEqual(calls, [
    'guard',
    'disable',
    'invalidate:plugin-disabled',
    'activate',
    'invalidate:plugin-activated'
  ]);
});

test('replacing an inactive version leaves the running plugin untouched', async () => {
  const calls: string[] = [];
  const replacement = new ActivePluginReplacementService(
    { findActive: async () => storedPlugin('1.0.0') },
    { assertCanDisable: async () => void calls.push('guard') },
    {
      disable: async () => void calls.push('disable'),
      activate: async () => {
        calls.push('activate');
        return {};
      }
    },
    { invalidate: async () => void calls.push('invalidate') }
  );

  assert.equal(
    await replacement.beforeReplace({ pluginId: 'novelcool', version: '2.0.0' }),
    undefined
  );
  assert.deepEqual(calls, []);
});
