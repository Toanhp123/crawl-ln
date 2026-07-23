import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

function testEnvironment(storageDirectory: string): Environment {
  return createEnvironment({
    ...process.env,
    STORAGE_DIR: storageDirectory,
    SOURCE_READER_PLUGIN_DIR: join(storageDirectory, 'source-plugins')
  });
}

test('api starts migrations before background dispatch and closes in reverse order', async () => {
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

test('composition root exposes lifecycle, presentation and runtime identity', async (t) => {
  const storageDirectory = mkdtempSync(join(tmpdir(), 'novel-tool-container-'));
  t.after(() => rmSync(storageDirectory, { recursive: true, force: true }));
  const container = createAppContainer(testEnvironment(storageDirectory));
  assert.deepEqual(Object.keys(container).sort(), ['lifecycle', 'presentation', 'runtimeInstance']);
  assert.equal(container.runtimeInstance.formatVersion, 1);

  await container.lifecycle.start();
  await container.lifecycle.stop();
});

test('environment accepts an exact database file override', () => {
  const databasePath = resolve('fixtures', 'novel-tool.sqlite');
  assert.equal(createEnvironment({ DATABASE_PATH: databasePath }).databasePath, databasePath);
});
