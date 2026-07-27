import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApiError } from '../../apps/web/src/shared/api/errors.ts';
import { getSourcePluginUsageConflict } from '../../apps/web/src/features/manage-source-plugins/model/source-plugin-usage-conflict.ts';

test('source plugin usage conflict details are recognized from a 409 API error', () => {
  const conflict = getSourcePluginUsageConflict(
    new ApiError('Plugin is in use', {
      status: 409,
      code: 'CONFLICT',
      details: {
        reason: 'SOURCE_PLUGIN_IN_USE',
        operation: 'disable',
        pluginId: 'novelcool',
        blockingJobCount: 2,
        blockingJobs: [
          { jobId: 'job-1', novelId: 'novel-1', status: 'running' },
          { jobId: 'job-2', novelId: 'novel-2', status: 'queued' }
        ]
      }
    })
  );

  assert.equal(conflict?.operation, 'disable');
  assert.equal(conflict?.blockingJobCount, 2);
});

test('plugin actions show the usage conflict in a modal with a link to Activity', async () => {
  const [actions, hooks] = await Promise.all([
    readFile('apps/web/src/features/manage-source-plugins/ui/SourcePluginActions.tsx', 'utf8'),
    readFile(
      'apps/web/src/features/manage-source-plugins/model/use-source-plugin-actions.ts',
      'utf8'
    )
  ]);
  assert.match(hooks, /getSourcePluginUsageConflict/);
  assert.match(actions, /manageSourcePlugins\.usageConflictTitle/);
  assert.match(actions, /navigate\('\/activity'\)/);
  assert.match(actions, /<Modal/);
});
