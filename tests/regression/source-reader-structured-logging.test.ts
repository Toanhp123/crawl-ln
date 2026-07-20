import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  BoundedSourceReaderStructuredLogger,
  type SourceReaderStructuredLogger
} from '../../apps/api/src/modules/source-reader/application/services/source-reader-structured-logger.ts';
import { PluginContextFactory } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts';
import { ExternalProcessSupervisor } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts';

const secrets = [
  'password-secret',
  'token-secret',
  'cookie-secret',
  'authorization-secret',
  'otp-secret',
  'session-secret',
  'proxy-password-secret',
  'query-secret',
  'buffer-secret',
  'chapter-secret',
  '<article>raw-html-secret</article>',
  'stdout-secret-token',
  'stderr-secret-password'
];

function memoryLogger() {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      info: (message: string) => lines.push(message),
      warn: (message: string) => lines.push(message),
      error: (message: string) => lines.push(message)
    }
  };
}

function assertNoSecrets(lines: string[]): void {
  const output = lines.join('\n');
  for (const secret of secrets) {
    assert.equal(output.includes(secret), false, `log leaked ${secret}`);
  }
}

test('structured logger bounds plugin metadata, preserves trusted labels, and redacts secrets', () => {
  const captured = memoryLogger();
  const logger = new BoundedSourceReaderStructuredLogger(captured.logger);
  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let depth = 0; depth < 10; depth += 1) {
    const next: Record<string, unknown> = {};
    cursor[`depth${depth}`] = next;
    cursor = next;
  }
  cursor.password = 'password-secret';

  const result = logger.plugin(
    {
      requestId: 'trusted-request',
      pluginId: 'trusted-plugin',
      pluginVersion: '1.2.3',
      capability: 'metadata'
    },
    {
      level: 'warn',
      message: `plugin warning token=token-secret password=password-secret Bearer authorization-secret ${'x'.repeat(3_000)}`,
      metadata: {
        requestId: 'plugin-overwrite',
        pluginId: 'plugin-overwrite',
        operation: 'parse',
        selector: '.chapter',
        status: 'failed',
        durationMs: 12,
        itemCount: 100,
        warningCode: 'PARSER_WARNING',
        url: 'https://example.test/book?token=query-secret&chapter=1',
        password: 'password-secret',
        token: 'token-secret',
        cookie: 'cookie-secret',
        authorization: 'authorization-secret',
        otp: 'otp-secret',
        session: 'session-secret',
        proxyPassword: 'proxy-password-secret',
        body: 'chapter-secret',
        html: '<article>raw-html-secret</article>',
        buffer: Buffer.from('buffer-secret'),
        unknown: 'token-secret',
        values: Array.from({ length: 100 }, (_, index) => index),
        deep
      }
    }
  );

  assert.equal(result.accepted, true);
  assert.ok(result.violations.length > 0);
  assert.equal(captured.lines.length, 1);
  assert.match(captured.lines[0]!, /trusted-request/);
  assert.match(captured.lines[0]!, /trusted-plugin/);
  assert.equal(captured.lines[0]!.includes('plugin-overwrite'), false);
  assert.ok(Buffer.byteLength(captured.lines[0]!, 'utf8') < 12_000);
  assertNoSecrets(captured.lines);
});

test('plugin context routes untrusted metadata through the structured logger', () => {
  const captured = memoryLogger();
  const structured: SourceReaderStructuredLogger = new BoundedSourceReaderStructuredLogger(
    captured.logger
  );
  const factory = new PluginContextFactory(
    { get: async () => ({ status: 200, headers: {}, body: '' }) },
    { load: () => ({}) } as never,
    { now: () => new Date('2026-07-20T00:00:00.000Z') },
    structured
  );
  const context = factory.create({
    requestId: 'request-1',
    pluginId: 'plugin-1',
    pluginVersion: '1.0.0',
    capability: 'metadata',
    allowedHosts: ['example.test'],
    signal: new AbortController().signal,
    runtimeContext: {
      executionMode: 'in-process',
      cacheIdentity: {
        public: 'public',
        account: 'anonymous',
        user: 'anonymous',
        session: 'anonymous',
        network: 'direct'
      }
    } as never
  });

  context.logger.warn('unsafe session=session-secret', {
    operation: 'parse',
    url: 'https://example.test/?session=query-secret',
    password: 'password-secret',
    content: 'chapter-secret'
  });

  assertNoSecrets(captured.lines);
  assert.match(captured.lines[0]!, /request-1/);
  assert.match(captured.lines[0]!, /plugin-1/);
});

test('sandbox stdout and stderr become hashed policy events without raw content', async () => {
  const captured = memoryLogger();
  const structured = new BoundedSourceReaderStructuredLogger(captured.logger);
  const violations: Array<{ pluginId: string; pluginVersion: string; stream: string }> = [];
  const supervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: 30_000,
    cancelGraceMs: 100,
    structuredLogger: structured,
    onOutputPolicyViolation: async (input) => {
      violations.push(input);
    }
  });
  const root = resolve('tests/fixtures/source-reader/external-plugins/noisy');
  const handle = await supervisor.start({
    pluginId: 'noisy',
    pluginVersion: '1.0.0',
    packageRoot: root,
    entryPath: resolve(root, 'dist/index.js')
  });
  await handle.request(
    {
      requestId: 'request-noisy',
      operation: 'invokeCapability',
      deadlineAt: new Date(Date.now() + 10_000).toISOString(),
      payload: {}
    },
    new AbortController().signal
  );
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  await supervisor.stop('noisy', '1.0.0', 'test-complete');

  assert.ok(violations.some((item) => item.stream === 'stdout'));
  assert.ok(violations.some((item) => item.stream === 'stderr'));
  assert.match(captured.lines.join('\n'), /source_reader\.plugin_output_policy_violation/);
  assert.match(captured.lines.join('\n'), /previewHash/);
  assertNoSecrets(captured.lines);
});
