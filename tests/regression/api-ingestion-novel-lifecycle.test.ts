import assert from 'node:assert/strict';
import test from 'node:test';

const jobs = [
  { id: 'running-job', status: 'running' },
  { id: 'paused-job', status: 'paused' },
  { id: 'completed-job', status: 'completed' },
  { id: 'failed-job', status: 'failed' }
] as const;

test('novel ingestion lifecycle cancels non-terminal jobs and purge deletes their history', async () => {
  const commands =
    await import('../../apps/api/src/modules/ingestion/application/commands/job-control.commands.ts');
  assert.equal(typeof commands.CancelNovelJobsCommandHandler, 'function');
  assert.equal(typeof commands.PurgeNovelJobsCommandHandler, 'function');

  const cancelled: string[] = [];
  const deleted: string[] = [];
  const repository = {
    async findAllByNovelId() {
      return jobs;
    },
    async deleteByNovelId(novelId: string) {
      deleted.push(novelId);
    }
  };
  const queue = {
    async cancel(jobId: string) {
      cancelled.push(jobId);
    }
  };
  const cancel = new commands.CancelNovelJobsCommandHandler(repository as never, queue);
  const purge = new commands.PurgeNovelJobsCommandHandler(cancel, repository as never);

  await cancel.execute({ novelId: 'novel-1' });
  await purge.execute({ novelId: 'novel-1' });

  assert.deepEqual(cancelled, ['running-job', 'paused-job', 'running-job', 'paused-job']);
  assert.deepEqual(deleted, ['novel-1']);
});
