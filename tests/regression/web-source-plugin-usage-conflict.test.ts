import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApiError } from '../../apps/web/src/shared/api/errors.ts';
import { getSourcePluginUsageConflict } from '../../apps/web/src/entities/source-plugin/model/source-plugin-usage-conflict.ts';

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

test('permission denial recognizes plugin usage conflict details', () => {
  const conflict = getSourcePluginUsageConflict(
    new ApiError('Plugin is in use', {
      status: 409,
      code: 'CONFLICT',
      details: {
        reason: 'SOURCE_PLUGIN_IN_USE',
        operation: 'deny',
        pluginId: 'novelcool',
        blockingJobCount: 1,
        blockingJobs: [{ jobId: 'job-paused', novelId: 'novel-1', status: 'paused' }]
      }
    })
  );

  assert.equal(conflict?.operation, 'deny');
  assert.equal(conflict?.blockingJobs[0]?.status, 'paused');
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

test('permission review shows deny usage conflicts in a modal with an Activity action', async () => {
  const [review, hook] = await Promise.all([
    readFile(
      'apps/web/src/features/review-source-permissions/ui/ReviewSourcePermissions.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/features/review-source-permissions/model/use-review-source-permissions.ts',
      'utf8'
    )
  ]);

  assert.match(hook, /getSourcePluginUsageConflict/);
  assert.match(review, /reviewSourcePermissions\.denyUsageConflict/);
  assert.match(review, /navigate\('\/activity'\)/);
  assert.match(review, /<Modal/);
});
