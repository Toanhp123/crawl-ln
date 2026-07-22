import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryRealtimeEventBroker } from '../../apps/api-legacy/src/shared/realtime/realtime-event-broker.ts';

test('realtime broker assigns monotonic ids, replays recent events, and unsubscribes listeners', () => {
  const broker = new InMemoryRealtimeEventBroker({
    historyLimit: 2,
    now: () => '2026-07-19T00:00:00.000Z'
  });
  const delivered: string[] = [];
  const unsubscribe = broker.subscribe((event) => delivered.push(event.id));

  const first = broker.publish({
    type: 'data.changed',
    resources: ['tasks'],
    reason: 'task.created',
    taskId: 'task-1'
  });
  const second = broker.publish({
    type: 'data.changed',
    resources: ['novels'],
    reason: 'novel.updated',
    novelId: 'novel-1'
  });
  const third = broker.publish({
    type: 'data.changed',
    resources: ['scheduler'],
    reason: 'scheduler.updated'
  });

  assert.deepEqual([first.id, second.id, third.id], ['1', '2', '3']);
  assert.deepEqual(delivered, ['1', '2', '3']);

  const replayed: string[] = [];
  broker.subscribe((event) => replayed.push(event.id), '1')();
  assert.deepEqual(replayed, ['2', '3']);

  unsubscribe();
  broker.publish({ type: 'data.changed', resources: ['plugins'], reason: 'plugins.reloaded' });
  assert.deepEqual(delivered, ['1', '2', '3']);
});

test('a broken realtime listener cannot fail the authoritative mutation path', () => {
  const broker = new InMemoryRealtimeEventBroker();
  const delivered: string[] = [];
  broker.subscribe(() => {
    throw new Error('disconnected client');
  });
  broker.subscribe((event) => delivered.push(event.id));

  assert.doesNotThrow(() =>
    broker.publish({ type: 'data.changed', resources: ['novels'], reason: 'novel.updated' })
  );
  assert.deepEqual(delivered, ['1']);
});
