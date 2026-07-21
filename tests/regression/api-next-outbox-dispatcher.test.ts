import assert from 'node:assert/strict';
import test from 'node:test';
import type { ApplicationEvent } from '../../apps/api-next/src/platform/events/application-event.ts';
import type { EventBus } from '../../apps/api-next/src/platform/events/event-bus.ts';
import { InMemoryEventBus } from '../../apps/api-next/src/platform/events/in-memory-event-bus.ts';
import { OutboxDispatcher } from '../../apps/api-next/src/platform/events/outbox-dispatcher.ts';
import type { OutboxSource } from '../../apps/api-next/src/platform/events/outbox-source.ts';

const now = '2026-07-21T00:00:00.000Z';
const clock = { now: () => new Date(now) };

function event(id: string): ApplicationEvent<{ id: string }> {
  return { id, type: 'fixture.created', occurredAt: now, payload: { id } };
}

class FakeOutboxSource implements OutboxSource {
  readonly deliveredIds: string[] = [];
  claimCalls = 0;

  constructor(readonly pending: ApplicationEvent[]) {}

  get pendingIds(): string[] {
    return this.pending.map((item) => item.id);
  }

  async claimBatch(limit: number): Promise<ApplicationEvent[]> {
    this.claimCalls += 1;
    return this.pending.slice(0, limit);
  }

  async markDelivered(ids: string[]): Promise<void> {
    this.deliveredIds.push(...ids);
    for (const id of ids) {
      const index = this.pending.findIndex((item) => item.id === id);
      if (index >= 0) this.pending.splice(index, 1);
    }
  }
}

class FakeEventBus implements EventBus {
  readonly publishedIds: string[] = [];

  constructor(private readonly options: { failOn?: string } = {}) {}

  async publish(value: ApplicationEvent): Promise<void> {
    this.publishedIds.push(value.id);
    if (value.id === this.options.failOn) throw new Error('publish failed');
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

test('dispatcher marks only successfully published events as delivered', async () => {
  const source = new FakeOutboxSource([event('one'), event('two')]);
  const bus = new FakeEventBus({ failOn: 'two' });
  const errors: Array<Record<string, unknown> | undefined> = [];
  const logger = {
    error(_message: string, metadata?: Record<string, unknown>) {
      errors.push(metadata);
    }
  };
  const dispatcher = new OutboxDispatcher([source], bus, clock, logger, { batchSize: 10 });

  assert.equal(await dispatcher.tick(), 1);
  assert.deepEqual(source.deliveredIds, ['one']);
  assert.deepEqual(source.pendingIds, ['two']);
  assert.deepEqual(bus.publishedIds, ['one', 'two']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.eventId, 'two');
  assert.equal('payload' in (errors[0] ?? {}), false);
});

test('dispatcher ignores an empty source without busy looping', async () => {
  const source = new FakeOutboxSource([]);
  const dispatcher = new OutboxDispatcher([source], new FakeEventBus(), clock, { error() {} });

  assert.equal(await dispatcher.tick(), 0);
  assert.equal(source.claimCalls, 1);
});

test('dispatcher respects the configured batch bound', async () => {
  const source = new FakeOutboxSource([event('one'), event('two'), event('three')]);
  const dispatcher = new OutboxDispatcher(
    [source],
    new FakeEventBus(),
    clock,
    { error() {} },
    { batchSize: 2 }
  );

  assert.equal(await dispatcher.tick(), 2);
  assert.deepEqual(source.pendingIds, ['three']);
});

test('in-memory event subscriptions are typed and removable', async () => {
  const bus = new InMemoryEventBus();
  const received: string[] = [];
  const unsubscribe = bus.subscribe<{ id: string }>('fixture.created', async (value) => {
    received.push(value.payload.id);
  });

  await bus.publish(event('one'));
  unsubscribe();
  await bus.publish(event('two'));
  assert.deepEqual(received, ['one']);
});
