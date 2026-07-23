import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('cooperative child exits and records cleanup after close', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-dev-child-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { startCooperativeNode } = await import('../../scripts/cli/lib/process-runner.mjs');
  const service = await startCooperativeNode({
    entry: join(process.cwd(), 'tests/fixtures/command-system/cooperative-service.mjs'),
    args: [root],
    cwd: process.cwd(),
    env: process.env,
    readyTimeoutMs: 2_000
  });
  assert.equal(service.url, 'fixture://ready');
  await service.close();
  await service.closed;
  assert.equal((await readFile(join(root, 'closed'), 'utf8')).trim(), 'closed');
});

test('cooperative child failure rejects and leaves no sentinel process', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-dev-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { startCooperativeNode } = await import('../../scripts/cli/lib/process-runner.mjs');
  const service = await startCooperativeNode({
    entry: join(process.cwd(), 'tests/fixtures/command-system/cooperative-service.mjs'),
    args: [root, '--fail-after-ready'],
    cwd: process.cwd(),
    env: process.env,
    readyTimeoutMs: 2_000
  });
  await assert.rejects(service.closed, /code 1/);
  assert.equal((await readFile(join(root, 'closed'), 'utf8')).trim(), 'closed');
  assert.throws(
    () => process.kill(service.pid, 0),
    (error: NodeJS.ErrnoException) => error.code === 'ESRCH'
  );
});

test('development supervisor closes its peer when one service fails', async () => {
  const closed: string[] = [];
  const { superviseDevelopment } = await import('../../scripts/cli/lib/development.mjs');
  const failed = Promise.reject(new Error('api failed'));
  failed.catch(() => undefined);
  await assert.rejects(
    () =>
      superviseDevelopment([
        {
          name: 'api',
          closed: failed,
          async close() {
            closed.push('api');
          }
        },
        {
          name: 'web',
          closed: new Promise(() => undefined),
          async close() {
            closed.push('web');
          }
        }
      ]),
    /api failed/
  );
  assert.deepEqual(closed.sort(), ['api', 'web']);
});

test('development supervisor closes every service before reporting interruption', async () => {
  const closed: string[] = [];
  const controller = new AbortController();
  const { superviseDevelopment } = await import('../../scripts/cli/lib/development.mjs');
  const waiting = superviseDevelopment(
    [
      {
        name: 'api',
        closed: new Promise(() => undefined),
        async close() {
          closed.push('api');
        }
      },
      {
        name: 'web',
        closed: new Promise(() => undefined),
        async close() {
          closed.push('web');
        }
      }
    ],
    { signal: controller.signal }
  );
  controller.abort();
  await assert.rejects(waiting, (error: Error & { exitCode?: number }) => error.exitCode === 130);
  assert.deepEqual(closed.sort(), ['api', 'web']);
});

test('interruption keeps exit 130 even when cooperative cleanup reports an error', async () => {
  const controller = new AbortController();
  const { superviseDevelopment } = await import('../../scripts/cli/lib/development.mjs');
  const waiting = superviseDevelopment(
    [
      {
        name: 'api',
        closed: new Promise(() => undefined),
        async close() {
          throw new Error('cleanup failed');
        }
      }
    ],
    { signal: controller.signal }
  );
  controller.abort();
  await assert.rejects(
    waiting,
    (error: Error & { exitCode?: number; cause?: unknown }) =>
      error.exitCode === 130 && String(error.cause).includes('cleanup failed')
  );
});

test('development proxy follows the actual API ready URL', async () => {
  const { developmentProxyTarget } = await import('../../scripts/cli/lib/development.mjs');
  assert.equal(
    developmentProxyTarget({
      apiUrl: 'http://127.0.0.1:43123/path',
      environment: { PORT: '3000' }
    }),
    'http://127.0.0.1:43123'
  );
  assert.equal(developmentProxyTarget({ environment: { PORT: '4123' } }), 'http://127.0.0.1:4123');
});

test('development target orchestration uses exact preparation and service traces', async () => {
  const { runDevelopment } = await import('../../scripts/cli/lib/development.mjs');
  const cases = [
    {
      target: undefined,
      expected: [
        'prepare:shared,sdk,reader-engine',
        'api:start',
        'web:start:http://127.0.0.1:43123',
        'supervise:api,web'
      ]
    },
    {
      target: 'api',
      expected: ['prepare:shared,sdk', 'api:start', 'supervise:api']
    },
    {
      target: 'web',
      expected: ['prepare:shared,reader-engine', 'web:start:http://127.0.0.1:3000', 'supervise:web']
    }
  ] as const;

  for (const item of cases) {
    const trace: string[] = [];
    const service = (name: string, url?: string) => ({
      name,
      url,
      closed: new Promise(() => undefined),
      async close() {}
    });
    await runDevelopment({
      target: item.target,
      environment: {},
      prepare: async (targets: string[]) => trace.push(`prepare:${targets.join(',')}`),
      startApi: async () => {
        trace.push('api:start');
        return service('api', 'http://127.0.0.1:43123');
      },
      startWeb: async ({ proxyTarget }: { proxyTarget: string }) => {
        trace.push(`web:start:${proxyTarget}`);
        return service('web', 'http://127.0.0.1:5173');
      },
      supervise: async (services: Array<{ name: string }>) => {
        trace.push(`supervise:${services.map((entry) => entry.name).join(',')}`);
      }
    });
    assert.deepEqual(trace, item.expected);
  }
});
