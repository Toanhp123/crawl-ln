import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { ExternalProcessSupervisor } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts';

async function createPlugin(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'source-plugin-sdk-errors-'));
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(
    resolve(root, 'dist/index.js'),
    `export async function invokeCapability(payload) {
      const error = new Error(String(payload.message ?? 'plugin failure'));
      error.name = 'SourcePluginError';
      error.code = String(payload.code ?? 'UNKNOWN_PLUGIN_CODE');
      error.retryable = false;
      error.fallbackAllowed = false;
      error.details = { secret: 'must-not-cross-boundary' };
      throw error;
    }`
  );
  return root;
}

async function invoke(
  supervisor: ExternalProcessSupervisor,
  root: string,
  code: string
): Promise<unknown> {
  const handle = await supervisor.start({
    pluginId: 'sdk-errors',
    pluginVersion: '1.0.0',
    packageRoot: root,
    entryPath: resolve(root, 'dist/index.js')
  });
  return handle.request(
    {
      requestId: randomUUID(),
      operation: 'invokeCapability',
      deadlineAt: new Date(Date.now() + 10_000).toISOString(),
      payload: { code, message: 'upstream challenge' }
    },
    new AbortController().signal
  );
}

test('sandbox preserves allowlisted SDK plugin error codes with host-owned policy', async (t) => {
  const root = await createPlugin();
  const supervisor = new ExternalProcessSupervisor({ startupTimeoutMs: 30_000, cancelGraceMs: 20 });
  t.after(async () => {
    await supervisor.stop('sdk-errors', '1.0.0', 'test-complete');
    await rm(root, { recursive: true, force: true });
  });

  await assert.rejects(
    () => invoke(supervisor, root, 'UPSTREAM_CHALLENGE_DETECTED'),
    (error: unknown) => {
      assert.ok(error instanceof SourceReaderError);
      assert.equal(error.code, 'UPSTREAM_CHALLENGE_DETECTED');
      assert.equal(error.retryable, true);
      assert.equal(error.fallbackAllowed, true);
      assert.equal(error.message, 'upstream challenge');
      assert.equal(error.details, undefined);
      return true;
    }
  );
});

test('sandbox collapses unknown or host-internal plugin error codes', async (t) => {
  const root = await createPlugin();
  const supervisor = new ExternalProcessSupervisor({ startupTimeoutMs: 30_000, cancelGraceMs: 20 });
  t.after(async () => {
    await supervisor.stop('sdk-errors', '1.0.0', 'test-complete');
    await rm(root, { recursive: true, force: true });
  });

  for (const code of ['UNKNOWN_PLUGIN_CODE', 'PLUGIN_PERMISSION_DENIED']) {
    await assert.rejects(
      () => invoke(supervisor, root, code),
      (error: unknown) => error instanceof SourceReaderError && error.code === 'PLUGIN_UNAVAILABLE'
    );
  }
});
