import test from 'node:test';
import assert from 'node:assert/strict';
import type { Novel, NovelUpdateDiagnostic } from '@novel-tool/shared';
import { AutoUpdateSchedulerService } from '../../apps/api/src/modules/scheduler/application/auto-update-scheduler.service.ts';
import type { AutoUpdatePolicyRepository } from '../../apps/api/src/modules/scheduler/application/ports/auto-update-policy.repository.ts';
import type { TaskRepository } from '../../apps/api/src/modules/task/domain/repositories/task.repository.ts';
import type { NovelUpdateDiagnosticPublisherPort } from '../../apps/api/src/modules/scheduler/application/ports/scheduler-diagnostic-publisher.port.ts';
import type { UpdateNovelUseCase } from '../../apps/api/src/modules/novels/application/use-cases/update-novel.usecase.ts';

const novel = (id: string, failures = 0): Novel => ({
  id,
  title: id,
  sourceUrl: `https://example.com/${id}`,
  sourceName: 'example',
  status: 'completed',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  autoUpdateEnabled: true,
  updateIntervalMinutes: 360,
  consecutiveUpdateFailures: failures
});

function harness(
  due: Novel[],
  options: { active?: Set<string>; execute?: (id: string) => Promise<any> } = {}
) {
  const states: Array<{ id: string; state: any }> = [];
  const diagnostics: NovelUpdateDiagnostic[] = [];
  const prunes: Array<{ id: string; keep: number }> = [];
  let requestedLimit = 0;
  const policies = {
    listDue: async (_now: string, limit: number) => {
      requestedLimit = limit;
      return due.slice(0, limit);
    },
    recordState: async (id: string, state: any) => {
      states.push({ id, state });
    },
    countMonitored: async () => due.length,
    countDue: async () => due.length
  } as unknown as AutoUpdatePolicyRepository;
  const tasks = {
    hasActiveForNovel: async (id: string) => options.active?.has(id) ?? false
  } as unknown as TaskRepository;
  const diagnosticPublisher: NovelUpdateDiagnosticPublisherPort = {
    publish: async (entry, keep) => {
      diagnostics.push(entry);
      prunes.push({ id: entry.novelId, keep });
    }
  };
  const updateNovel = {
    execute:
      options.execute ??
      (async () => ({ task: undefined, newChapterCount: 0, pendingChapterCount: 0 }))
  } as unknown as UpdateNovelUseCase;
  const fixed = new Date('2026-07-16T08:00:00.000Z');
  const service = new AutoUpdateSchedulerService(
    policies,
    tasks,
    diagnosticPublisher,
    updateNovel,
    { now: () => new Date(fixed) },
    { randomId: () => `d-${diagnostics.length}` },
    { info() {}, warn() {}, error() {} }
  );
  return { service, states, diagnostics, prunes, getRequestedLimit: () => requestedLimit };
}

test('scheduler requests at most five due novels and retains 100 diagnostics per novel', async () => {
  const h = harness(Array.from({ length: 8 }, (_, index) => novel(String(index + 1))));
  await h.service.tick();
  assert.equal(h.getRequestedLimit(), 5);
  assert.equal(h.diagnostics.length, 5);
  assert.deepEqual(
    h.prunes,
    Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1), keep: 100 }))
  );
});

test('scheduler runs no more than three novel updates concurrently', async () => {
  let active = 0;
  let maximum = 0;
  const releases: Array<() => void> = [];
  const h = harness(
    Array.from({ length: 5 }, (_, index) => novel(String(index + 1))),
    {
      execute: async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return { task: undefined, newChapterCount: 0, pendingChapterCount: 0 };
      }
    }
  );
  const tick = h.service.tick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(maximum, 3);
  releases.splice(0, 3).forEach((release) => release());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(maximum, 3);
  releases.splice(0).forEach((release) => release());
  await tick;
});

test('scheduler skips active tasks without invoking update use case', async () => {
  let calls = 0;
  const h = harness([novel('active')], {
    active: new Set(['active']),
    execute: async () => {
      calls += 1;
      throw new Error('should not run');
    }
  });
  await h.service.tick();
  assert.equal(calls, 0);
  assert.equal(h.diagnostics[0]?.result, 'skipped_active_task');
});

test('scheduler uses fake clock and applies the next failure backoff', async () => {
  const h = harness([novel('broken', 1)], {
    execute: async () => {
      throw new Error('network down');
    }
  });
  await h.service.tick();
  assert.equal(h.states[0]?.state.lastCheckAt, '2026-07-16T08:00:00.000Z');
  assert.equal(h.states[0]?.state.nextCheckAt, '2026-07-16T08:15:00.000Z');
  assert.equal(h.states[0]?.state.consecutiveFailures, 2);
  assert.equal(h.diagnostics[0]?.durationMs, 0);
});

test('scheduler diagnostics failure does not convert a successful update into a policy failure', async () => {
  const states: Array<any> = [];
  const policies = {
    listDue: async () => [novel('ok')],
    recordState: async (_id: string, state: any) => {
      states.push(state);
    },
    countMonitored: async () => 1,
    countDue: async () => 1
  } as unknown as AutoUpdatePolicyRepository;
  const diagnostics = {
    publish: async () => {
      throw new Error('disk full');
    }
  } as unknown as NovelUpdateDiagnosticPublisherPort;
  const logs: string[] = [];
  const service = new AutoUpdateSchedulerService(
    policies,
    { hasActiveForNovel: async () => false } as unknown as TaskRepository,
    diagnostics,
    {
      execute: async () => ({ task: undefined, newChapterCount: 0, pendingChapterCount: 0 })
    } as unknown as UpdateNovelUseCase,
    { now: () => new Date('2026-07-16T08:00:00.000Z') },
    { randomId: () => 'd-1' },
    {
      info() {},
      warn() {},
      error(message: string) {
        logs.push(message);
      }
    }
  );
  await service.tick();
  assert.equal(states.length, 1);
  assert.equal(states[0].result, 'up_to_date');
  assert.equal(states[0].consecutiveFailures, 0);
  assert.match(logs[0] ?? '', /diagnostics failed/i);
});
