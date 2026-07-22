import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  InProcessSourceReaderObservability,
  redactSourceReaderValue
} from '../../apps/api-legacy/src/modules/source-reader/infrastructure/observability/source-reader-observability.ts';
import { sourceReaderRequestIdMiddleware } from '../../apps/api-legacy/src/modules/source-reader/presentation/source-reader-request-id.middleware.ts';

test('redaction removes auth query values, cookies, OTP, and authorization headers', () => {
  assert.deepEqual(
    redactSourceReaderValue({
      url: 'https://example.test/book?token=secret&chapter=1',
      headers: { authorization: 'Bearer secret', cookie: 'sid=secret' },
      otp: '123456',
      chapter: 1
    }),
    {
      url: 'https://example.test/book?token=%5BREDACTED%5D&chapter=1',
      headers: { authorization: '[REDACTED]', cookie: '[REDACTED]' },
      otp: '[REDACTED]',
      chapter: 1
    }
  );
});

test('observability exposes only bounded labels in snapshots', () => {
  const events: string[] = [];
  const observability = new InProcessSourceReaderObservability({
    info: (message: string) => events.push(message),
    warn: () => undefined,
    error: () => undefined
  });
  observability.invocationFinished({
    requestId: 'request-secret',
    invocationId: 'invocation-secret',
    pluginId: 'demo',
    capability: 'metadata',
    runtimeMode: 'in-process',
    result: 'failed',
    durationMs: 12,
    failureCode: 'SOURCE_REQUEST_TIMEOUT'
  });
  const snapshot = observability.snapshot();
  assert.equal(snapshot.source_reader_invocations_total['demo|metadata|failed|in-process'], 1);
  assert.equal(
    snapshot.source_reader_errors_total['demo|metadata|SOURCE_REQUEST_TIMEOUT|in-process'],
    1
  );
  assert.equal(JSON.stringify(snapshot).includes('request-secret'), false);
  assert.equal(events.length, 1);
});

test('request id middleware echoes a supplied id', () => {
  const headers = new Map<string, string>();
  const response = {
    locals: {},
    setHeader: (key: string, value: string) => headers.set(key, value)
  };
  let next = false;
  sourceReaderRequestIdMiddleware(
    { header: (name: string) => (name === 'x-request-id' ? 'request-1' : undefined) } as never,
    response as never,
    (() => void (next = true)) as never
  );
  assert.equal(
    (response.locals as { sourceReaderRequestId?: string }).sourceReaderRequestId,
    'request-1'
  );
  assert.equal(headers.get('x-request-id'), 'request-1');
  assert.equal(next, true);
});

test('source reader service wraps candidate invocation with circuit rate and observability', async () => {
  const source = await readFile(
    'apps/api-legacy/src/modules/source-reader/application/services/source-reader.service.ts',
    'utf8'
  );
  assert.match(source, /circuit\.allow/);
  assert.match(source, /rateLimiter\.enter/);
  assert.match(source, /observability\.invocationStarted/);
  assert.match(source, /observability\.invocationFinished/);
});
