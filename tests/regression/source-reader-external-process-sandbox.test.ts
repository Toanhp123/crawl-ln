import assert from 'node:assert/strict';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { ExternalProcessSupervisor } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts';

const fixture = (name: string) => resolve(`tests/fixtures/source-reader/external-plugins/${name}`);

const deadline = (ms = 10_000) => new Date(Date.now() + ms).toISOString();

async function invoke(supervisor: ExternalProcessSupervisor, name: string, payload = {}) {
  const root = fixture(name);
  const handle = await supervisor.start({
    pluginId: name,
    pluginVersion: '1.0.0',
    packageRoot: root,
    entryPath: resolve(root, 'dist/index.js')
  });
  return handle.request(
    {
      requestId: randomUUID(),
      operation: 'invokeCapability',
      deadlineAt: deadline(),
      payload
    },
    new AbortController().signal
  );
}

test('external process sandbox blocks ambient Node authority and preserves pure computation', async () => {
  process.env.SOURCE_READER_MASTER_KEY = 'must-not-leak';
  const supervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: 10_000,
    cancelGraceMs: 100
  });
  const hostile = (await invoke(supervisor, 'hostile')) as { data: Record<string, unknown> };
  delete process.env.SOURCE_READER_MASTER_KEY;

  for (const name of ['fs', 'childProcess', 'net', 'workerThreads']) {
    assert.notEqual(hostile.data[name], 'ALLOWED');
  }
  assert.equal(hostile.data.env, 'BLOCKED');
  assert.equal(hostile.data.fetch, 'undefined');
  assert.equal(typeof hostile.data.clock, 'string');

  const pure = (await invoke(supervisor, 'pure-compute', { left: 20, right: 22 })) as {
    data: { sum: number; clock: string };
  };
  assert.equal(pure.data.sum, 42);
  assert.equal(typeof pure.data.clock, 'string');

  await supervisor.stop('hostile', '1.0.0', 'test-complete');
  await supervisor.stop('pure-compute', '1.0.0', 'test-complete');
});

test('sandbox startup rejects root escapes, native addons, and executable files', async () => {
  const supervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: 10_000,
    cancelGraceMs: 100
  });
  const symlinkRoot = await mkdtemp(resolve(tmpdir(), 'source-reader-symlink-'));
  await mkdir(resolve(symlinkRoot, 'dist'), { recursive: true });
  await writeFile(
    resolve(symlinkRoot, 'dist/index.js'),
    'export const invokeCapability = () => ({ data: {} });'
  );
  await symlink('/etc/hostname', resolve(symlinkRoot, 'escape'));
  await assert.rejects(
    () =>
      supervisor.start({
        pluginId: 'escape',
        pluginVersion: '1.0.0',
        packageRoot: symlinkRoot,
        entryPath: resolve(symlinkRoot, 'dist/index.js')
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_SANDBOX_POLICY_VIOLATION'
  );

  const nativeRoot = await mkdtemp(resolve(tmpdir(), 'source-reader-native-'));
  await mkdir(resolve(nativeRoot, 'dist'), { recursive: true });
  await writeFile(
    resolve(nativeRoot, 'dist/index.js'),
    'export const invokeCapability = () => ({ data: {} });'
  );
  await writeFile(resolve(nativeRoot, 'addon.node'), 'not-native');
  await assert.rejects(
    () =>
      supervisor.start({
        pluginId: 'native',
        pluginVersion: '1.0.0',
        packageRoot: nativeRoot,
        entryPath: resolve(nativeRoot, 'dist/index.js')
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_SANDBOX_POLICY_VIOLATION'
  );

  const executableRoot = await mkdtemp(resolve(tmpdir(), 'source-reader-exec-'));
  await mkdir(resolve(executableRoot, 'dist'), { recursive: true });
  await writeFile(
    resolve(executableRoot, 'dist/index.js'),
    'export const invokeCapability = () => ({ data: {} });'
  );
  await writeFile(resolve(executableRoot, 'tool.js'), 'export default 1;');
  await chmod(resolve(executableRoot, 'tool.js'), 0o755);
  await assert.rejects(
    () =>
      supervisor.start({
        pluginId: 'executable',
        pluginVersion: '1.0.0',
        packageRoot: executableRoot,
        entryPath: resolve(executableRoot, 'dist/index.js')
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_SANDBOX_POLICY_VIOLATION'
  );
});

test('timeout and cancellation terminate the sandbox handle after the grace period', async () => {
  const supervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: 10_000,
    cancelGraceMs: 100
  });
  const root = fixture('pure-compute');
  const handle = await supervisor.start({
    pluginId: 'pure-compute',
    pluginVersion: '1.0.0',
    packageRoot: root,
    entryPath: resolve(root, 'dist/index.js')
  });
  await assert.rejects(
    () =>
      handle.request(
        {
          requestId: randomUUID(),
          operation: 'invokeCapability',
          deadlineAt: deadline(40),
          payload: { mode: 'hang' }
        },
        new AbortController().signal
      ),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SOURCE_REQUEST_TIMEOUT'
  );
  assert.equal(supervisor.get('pure-compute', '1.0.0'), undefined);

  const restarted = await supervisor.start({
    pluginId: 'pure-compute',
    pluginVersion: '1.0.0',
    packageRoot: root,
    entryPath: resolve(root, 'dist/index.js')
  });
  const abort = new AbortController();
  const pending = restarted.request(
    {
      requestId: randomUUID(),
      operation: 'invokeCapability',
      deadlineAt: deadline(),
      payload: { mode: 'hang' }
    },
    abort.signal
  );
  abort.abort();
  await assert.rejects(
    () => pending,
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SOURCE_READER_CANCELLED'
  );
  assert.equal(supervisor.get('pure-compute', '1.0.0'), undefined);
});
