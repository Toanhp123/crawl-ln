import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createAppContainer } from '../../apps/api-next/src/bootstrap/app-container.ts';
import { createAppLifecycle } from '../../apps/api-next/src/platform/lifecycle/app-lifecycle.ts';
import {
  createEnvironment,
  type NextEnvironment
} from '../../apps/api-next/src/platform/config/environment.ts';

function createTestContainer(order: string[]) {
  return createAppLifecycle({
    database: {
      open() {
        order.push('database.open');
      },
      close() {
        order.push('database.close');
      }
    },
    migrations: {
      run() {
        order.push('migrations.run');
      }
    },
    modules: [],
    outbox: {
      start() {
        order.push('outbox.start');
      },
      async stop() {
        order.push('outbox.stop');
      }
    }
  });
}

function testEnvironment(): NextEnvironment {
  return {
    host: '127.0.0.1',
    port: 3100,
    databasePath: ':memory:',
    outboxBatchSize: 10,
    outboxIntervalMs: 1_000
  };
}

test('api-next starts migrations before background dispatch and closes in reverse order', async () => {
  const order: string[] = [];
  const runtime = createTestContainer(order);

  await runtime.start();
  await runtime.stop();
  assert.deepEqual(order, [
    'database.open',
    'migrations.run',
    'outbox.start',
    'outbox.stop',
    'database.close'
  ]);
});

test('composition root exposes only lifecycle and presentation surfaces', async () => {
  const container = createAppContainer(testEnvironment());
  assert.deepEqual(Object.keys(container).sort(), ['lifecycle', 'presentation']);

  await container.lifecycle.start();
  await container.lifecycle.stop();
});

test('environment accepts an exact database file override', () => {
  const databasePath = resolve('fixtures', 'novel-tool.sqlite');
  assert.equal(createEnvironment({ NEXT_DATABASE_PATH: databasePath }).databasePath, databasePath);
});
