import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createAppContainer } from '../../apps/api/src/bootstrap/app-container.ts';
import { createAppLifecycle } from '../../apps/api/src/platform/lifecycle/app-lifecycle.ts';
import {
  createEnvironment,
  type Environment
} from '../../apps/api/src/platform/config/environment.ts';

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

function testEnvironment(): Environment {
  return {
    host: '127.0.0.1',
    port: 3000,
    databasePath: ':memory:',
    outboxBatchSize: 10,
    outboxIntervalMs: 1_000,
    crawlerDelayMs: 600,
    maxExportSourceBytes: 128 * 1024 * 1024,
    sourceAllowlist: []
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
  assert.equal(createEnvironment({ DATABASE_PATH: databasePath }).databasePath, databasePath);
});
