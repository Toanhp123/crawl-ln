import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SEARCH_REBUILD_COMPLETED,
  SEARCH_REBUILD_FAILED,
  SEARCH_REBUILD_STARTED
} from '../../apps/api/src/modules/search/application/events/search-rebuild.event.ts';
import { InMemoryEventBus } from '../../apps/api/src/platform/events/in-memory-event-bus.ts';
import { ApplicationEventToRealtimeAdapter } from '../../apps/api/src/platform/realtime/application-event-to-realtime.adapter.ts';
import { InMemoryRealtimeEventBroker } from '../../apps/api/src/platform/realtime/in-memory-realtime-event-broker.ts';

const occurredAt = '2026-07-21T11:00:00.000Z';

test('application event adapter maps durable module events to realtime resources', async () => {
  const events = new InMemoryEventBus();
  const realtime = new InMemoryRealtimeEventBroker({ now: () => new Date(occurredAt) });
  const received: unknown[] = [];
  realtime.subscribe((event) => received.push(event));
  const adapter = new ApplicationEventToRealtimeAdapter(events, realtime);
  await adapter.start();

  await events.publish({
    id: 'library-1',
    type: 'library.analysis-reconciled',
    occurredAt,
    payload: {
      commandId: 'command-1',
      novel: { id: 'novel-1' },
      chapters: []
    }
  });
  await events.publish({
    id: 'ingestion-1',
    type: 'ingestion.audit-recorded',
    occurredAt,
    payload: {
      id: 'audit-1',
      jobId: 'task-1',
      type: 'chapter_failed',
      level: 'error',
      message: 'failed',
      chapterIndex: 2,
      createdAt: occurredAt
    }
  });
  await events.publish({
    id: 'scheduler-1',
    type: 'scheduler.diagnostic.recorded',
    occurredAt,
    payload: {
      diagnostic: {
        novelId: 'novel-1',
        result: 'failed'
      },
      retentionLimit: 30
    }
  });
  await events.publish({
    id: 'search-started',
    type: SEARCH_REBUILD_STARTED,
    occurredAt,
    payload: {}
  });
  await events.publish({
    id: 'search-completed',
    type: SEARCH_REBUILD_COMPLETED,
    occurredAt,
    payload: { indexedDocuments: 12, rebuiltAt: occurredAt }
  });
  await events.publish({
    id: 'search-failed',
    type: SEARCH_REBUILD_FAILED,
    occurredAt,
    payload: {}
  });

  assert.deepEqual(
    received.map((event) => {
      const { id: _id, occurredAt: _occurredAt, ...rest } = event as Record<string, unknown>;
      return rest;
    }),
    [
      {
        type: 'data.changed',
        resources: ['novels', 'search'],
        reason: 'novel.analyzed',
        novelId: 'novel-1'
      },
      {
        type: 'data.changed',
        resources: ['tasks', 'novels', 'search'],
        reason: 'crawl.chapter_failed',
        taskId: 'task-1',
        chapterIndex: 2
      },
      {
        type: 'data.changed',
        resources: ['scheduler', 'novels'],
        reason: 'scheduler.failed',
        novelId: 'novel-1'
      },
      {
        type: 'data.changed',
        resources: ['search'],
        reason: SEARCH_REBUILD_STARTED
      },
      {
        type: 'data.changed',
        resources: ['search'],
        reason: SEARCH_REBUILD_COMPLETED
      },
      {
        type: 'data.changed',
        resources: ['search'],
        reason: SEARCH_REBUILD_FAILED
      }
    ]
  );

  await adapter.stop();
  await events.publish({
    id: 'after-stop',
    type: 'library.novel-deleted',
    occurredAt,
    payload: {}
  });
  assert.equal(received.length, 6);
});

test('realtime broker accepts backup invalidations as a first-class resource', () => {
  const realtime = new InMemoryRealtimeEventBroker({ now: () => new Date(occurredAt) });
  const received: unknown[] = [];
  realtime.subscribe((event) => received.push(event));

  realtime.publish({
    type: 'data.changed',
    resources: ['backup'],
    reason: 'backup.operation.stage-changed'
  });

  assert.equal((received[0] as { resources: string[] }).resources[0], 'backup');
});
