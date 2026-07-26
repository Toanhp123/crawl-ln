import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { SourceRequestGateService } from '../../apps/api/src/modules/source-reader/application/services/source-request-gate.service.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { RequestGatedBrowserSession } from '../../apps/api/src/modules/source-reader/infrastructure/browser/browser-runtime.coordinator.ts';
import { InMemorySourceRateLimiterService } from '../../apps/api/src/modules/source-reader/infrastructure/network/in-memory-source-rate-limiter.service.ts';
import { RobotsTxtAccessPolicyAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/network/robots-txt-access-policy.adapter.ts';
import { createEnvironment } from '../../apps/api/src/platform/config/environment.ts';

async function readTree(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries) {
    const target = join(directory, entry.name);
    parts.push(entry.isDirectory() ? await readTree(target) : await readFile(target, 'utf8'));
  }
  return parts.join('\n');
}

test('api environment exposes crawler policy settings', () => {
  const environment = createEnvironment({
    SOURCE_ALLOWLIST: 'NovelCool.com, www.Example.com',
    CRAWLER_DELAY_MS: '1250'
  });

  assert.deepEqual(environment.sourceAllowlist, ['novelcool.com', 'www.example.com']);
  assert.equal(environment.crawlerDelayMs, 1_250);
});

test('source reader access policy denies hosts outside the source allowlist', async () => {
  let requests = 0;
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: {
      get: async () => {
        requests += 1;
        return 'User-agent: *\nAllow: /';
      }
    },
    sourceAllowlist: ['example.com'],
    defaultCrawlDelayMs: 600,
    requestTimeoutMs: 5_000
  });

  const decision = await policy.check('https://untrusted.test/novel');

  assert.deepEqual(decision, {
    allowed: false,
    reason: 'Source not allowlisted: untrusted.test'
  });
  assert.equal(requests, 0);
});

test('source reader access policy honors the longest robots rule and crawl delay', async () => {
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: {
      get: async () =>
        ['User-agent: *', 'Disallow: /private', 'Allow: /private/public', 'Crawl-delay: 1.25'].join(
          '\n'
        )
    },
    sourceAllowlist: ['example.com'],
    defaultCrawlDelayMs: 600,
    requestTimeoutMs: 5_000
  });

  assert.deepEqual(await policy.check('https://www.example.com/private/public/chapter-1'), {
    allowed: true,
    crawlDelayMs: 1_250
  });
  assert.deepEqual(await policy.check('https://example.com/private/chapter-2'), {
    allowed: false,
    reason: 'Blocked by robots.txt: /private'
  });
});

test('source reader access policy refetches robots rules after cache expiry', async () => {
  let now = 0;
  let requests = 0;
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: {
      get: async () => {
        requests += 1;
        return 'User-agent: *\nAllow: /';
      }
    },
    sourceAllowlist: ['example.com'],
    defaultCrawlDelayMs: 600,
    requestTimeoutMs: 5_000,
    now: () => now,
    successTtlMs: 100,
    failureTtlMs: 10
  });

  await policy.check('https://example.com/one');
  await policy.check('https://example.com/two');
  now = 101;
  await policy.check('https://example.com/three');

  assert.equal(requests, 2);
});

test('source rate limiter spaces requests per host and forwards cancellation', async () => {
  let now = 1_000;
  const waits: Array<{ milliseconds: number; signal?: AbortSignal }> = [];
  const limiter = new InMemorySourceRateLimiterService({
    now: () => now,
    async sleep(milliseconds, signal) {
      waits.push({ milliseconds, ...(signal === undefined ? {} : { signal }) });
      now += milliseconds;
    }
  });
  const signal = new AbortController().signal;

  await limiter.wait('example.test', 600);
  await limiter.wait('other.test', 600);
  await limiter.wait('example.test', 600, signal);

  assert.deepEqual(waits, [{ milliseconds: 600, signal }]);
});

test('source rate limiter aborts a pending host delay immediately', async () => {
  const limiter = new InMemorySourceRateLimiterService();
  await limiter.wait('example.test', 250);
  const controller = new AbortController();
  const pending = limiter.wait('example.test', 250, controller.signal);

  controller.abort();

  await assert.rejects(
    pending,
    (error: unknown) => error instanceof Error && error.name === 'AbortError'
  );
});

test('source request gate enforces policy before reserving the per-host request slot', async () => {
  const calls: string[] = [];
  const gate = new SourceRequestGateService(
    {
      async check(url) {
        calls.push(`policy:${url}`);
        return { allowed: true, crawlDelayMs: 750 };
      }
    },
    {
      async wait(key, delayMs, signal) {
        calls.push(`limit:${key}:${delayMs}:${String(signal?.aborted ?? false)}`);
      }
    }
  );
  const signal = new AbortController().signal;

  await gate.enter('https://www.example.test/chapter/1', signal);

  assert.deepEqual(calls, [
    'policy:https://www.example.test/chapter/1',
    'limit:example.test:750:false'
  ]);
});

test('source request gate maps policy denial to a typed source-reader error', async () => {
  let limiterCalls = 0;
  const gate = new SourceRequestGateService(
    { check: async () => ({ allowed: false, reason: 'Blocked by robots.txt: /private' }) },
    {
      async wait() {
        limiterCalls += 1;
      }
    }
  );

  await assert.rejects(
    () => gate.enter('https://example.test/private/chapter'),
    (error: unknown) =>
      error instanceof SourceReaderError &&
      error.code === 'NETWORK_ACCESS_BLOCKED' &&
      error.details?.reason === 'Blocked by robots.txt: /private'
  );
  assert.equal(limiterCalls, 0);
});

test('browser navigation passes through the source request gate on every open', async () => {
  const calls: string[] = [];
  const delegate = {
    id: 'browser-1',
    async open(url: string) {
      calls.push(`open:${url}`);
    },
    async waitFor() {},
    async text() {
      return null;
    },
    async html() {
      return null;
    },
    async click() {},
    async fillSecret() {},
    async cookies() {
      return [];
    },
    async close() {}
  };
  const signal = new AbortController().signal;
  const session = new RequestGatedBrowserSession(
    delegate,
    {
      async enter(url, observedSignal) {
        assert.equal(observedSignal, signal);
        calls.push(`gate:${url}`);
      }
    },
    signal
  );

  await session.open('https://example.test/one');
  await session.open('https://example.test/two');

  assert.deepEqual(calls, [
    'gate:https://example.test/one',
    'open:https://example.test/one',
    'gate:https://example.test/two',
    'open:https://example.test/two'
  ]);
});

test('ingestion owns result validation but no outbound source access policy', async () => {
  const ingestion = await readTree('apps/api/src/modules/ingestion');

  assert.match(ingestion, /Chapter URL is outside the metadata source host/);
  assert.doesNotMatch(
    ingestion,
    /RobotsTxtAccessPolicyAdapter|InMemorySourceRateLimiterService|SourceRateLimiterPort|assertAllowed\(/
  );
});

test('network diagnostics use an HTTP adapter outside the source request gate', async () => {
  const source = await readFile(
    'apps/api/src/modules/source-reader/source-reader.module.ts',
    'utf8'
  );

  assert.match(source, /const diagnosticHttp = new RouteAwareHttpClientAdapter/);
  assert.match(source, /new NetworkRouteTester\(\s*networks,\s*routes,\s*diagnosticHttp,/s);
});
