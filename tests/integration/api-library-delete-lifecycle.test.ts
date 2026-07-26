import assert from 'node:assert/strict';
import test from 'node:test';
import { LibraryController } from '../../apps/api/src/modules/library/presentation/library.controller.ts';

test('deleting a novel quiesces ingestion before Library deletion and purges task history after', async () => {
  const calls: string[] = [];
  const controller = new LibraryController(
    {
      queries: {
        async getNovel() {
          return { novel: { id: 'novel-1' }, chapters: [] } as never;
        }
      },
      commands: {
        async deleteNovel() {
          calls.push('library.delete');
        }
      }
    } as never,
    { listNovels: async () => [] } as never,
    {
      commands: {
        async cancelNovelJobs() {
          calls.push('ingestion.cancel');
        },
        async purgeNovelJobs() {
          calls.push('ingestion.purge');
        }
      },
      queries: {
        async getNovelJob() {
          return null;
        }
      }
    } as never,
    {} as never,
    {} as never,
    { now: () => new Date('2026-07-27T00:00:00.000Z') },
    { randomId: () => 'delete-command' },
    undefined
  );

  await controller.delete(
    { params: { id: 'novel-1' } } as never,
    { status: () => ({ send: () => undefined }) } as never
  );

  assert.deepEqual(calls, ['ingestion.cancel', 'library.delete', 'ingestion.purge']);
});
