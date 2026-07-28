import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { SourceRequestGateService } from '../../apps/api/src/modules/source-reader/application/services/source-request-gate.service.ts';
import { activePluginTrustedHosts } from '../../apps/api/src/modules/source-reader/application/services/active-plugin-trusted-hosts.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { InMemorySourceRateLimiterService } from '../../apps/api/src/modules/source-reader/infrastructure/network/in-memory-source-rate-limiter.service.ts';
import {
  AxiosRobotsTextClient,
  RobotsTxtAccessPolicyAdapter
} from '../../apps/api/src/modules/source-reader/infrastructure/network/robots-txt-access-policy.adapter.ts';
import { createEnvironment } from '../../apps/api/src/platform/config/environment.ts';

test('active plugin trusted hosts include only enabled plugin network permissions', () => {
  const registrations = new Map([
    [
      'enabled',
      {
        enabled: true,
        plugin: {
          manifest: { permissions: { network: { hosts: ['first.example', '*.second.example'] } } }
        }
      }
    ],
    [
      'disabled',
      {
        enabled: false,
        plugin: { manifest: { permissions: { network: { hosts: ['disabled.example'] } } } }
      }
    ]
  ]);

  assert.deepEqual(activePluginTrustedHosts(registrations), ['first.example', '*.second.example']);
});

async function readTree(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries) {
    const target = join(directory, entry.name);
    parts.push(entry.isDirectory() ? await readTree(target) : await readFile(target, 'utf8'));
  }
  return parts.join('\n');
}

test('api environment exposes crawler delay settings', () => {
  const environment = createEnvironment({
    CRAWLER_DELAY_MS: '1250'
  });

  assert.equal(environment.crawlerDelayMs, 1_250);
});

test('source reader access policy denies hosts outside active plugin trust', async () => {
  let requests = 0;
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: {
      get: async () => {
        requests += 1;
        return 'User-agent: *\nAllow: /';
      }
    },
    trustedHosts: () => ['example.com'],
    defaultCrawlDelayMs: 600,
    requestTimeoutMs: 5_000
  });

  const decision = await policy.check('https://untrusted.test/novel');

  assert.deepEqual(decision, {
    allowed: false,
    reason: 'Source not trusted by an active plugin: untrusted.test'
  });
  assert.equal(requests, 0);
});

test('source reader access policy resolves trusted plugin hosts for every request', async () => {
  let trustedHosts: readonly string[] = ['first.example', '*.second.example'];
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: {
      get: async () => 'User-agent: *\nAllow: /'
    },
    trustedHosts: () => trustedHosts,
    defaultCrawlDelayMs: 600,
    requestTimeoutMs: 5_000
  });

  assert.deepEqual(await policy.check('https://first.example/novel'), {
    allowed: true,
    crawlDelayMs: 600
  });
  assert.deepEqual(await policy.check('https://cdn.second.example/chapter'), {
    allowed: true,
    crawlDelayMs: 600
  });

  trustedHosts = ['second.example'];

  assert.deepEqual(await policy.check('https://first.example/novel'), {
    allowed: false,
    reason: 'Source not trusted by an active plugin: first.example'
  });
  assert.deepEqual(await policy.check('https://second.example/novel'), {
    allowed: true,
    crawlDelayMs: 600
  });
});

test('source reader access policy honors the longest robots rule and crawl delay', async () => {
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: {
      get: async () =>
        ['User-agent: *', 'Disallow: /private', 'Allow: /private/public', 'Crawl-delay: 1.25'].join(
          '\n'
        )
    },
    trustedHosts: () => ['example.com'],
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
    trustedHosts: () => ['example.com'],
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

test('source reader access policy follows safe robots redirects before deciding access', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/robots.txt') {
      response.statusCode = 302;
      response.setHeader('location', '/robots-rules.txt');
      response.end();
      return;
    }
    response.end('User-agent: *\nDisallow: /private');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('robots redirect server did not bind');
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: new AxiosRobotsTextClient(),
    trustedHosts: () => ['127.0.0.1'],
    defaultCrawlDelayMs: 0,
    requestTimeoutMs: 5_000
  });

  try {
    assert.deepEqual(await policy.check(`http://127.0.0.1:${address.port}/private/chapter`), {
      allowed: false,
      reason: 'Blocked by robots.txt: /private'
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('source reader access policy shares one initial robots load per host', async () => {
  let requests = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: {
      async get() {
        requests += 1;
        await ready;
        return 'User-agent: *\nDisallow: /private';
      }
    },
    trustedHosts: () => ['example.com'],
    defaultCrawlDelayMs: 0,
    requestTimeoutMs: 5_000
  });

  const decisions = Promise.all([
    policy.check('https://example.com/private/one'),
    policy.check('https://example.com/private/two')
  ]);
  await Promise.resolve();
  release();

  assert.deepEqual(await decisions, [
    { allowed: false, reason: 'Blocked by robots.txt: /private' },
    { allowed: false, reason: 'Blocked by robots.txt: /private' }
  ]);
  assert.equal(requests, 1);
  assert.deepEqual(await policy.check('https://example.com/private/three'), {
    allowed: false,
    reason: 'Blocked by robots.txt: /private'
  });
  assert.equal(requests, 1);
});

test('source reader access policy caches robots lookup failures as retryable denial', async () => {
  let requests = 0;
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: {
      async get() {
        requests += 1;
        throw new Error('robots unavailable');
      }
    },
    trustedHosts: () => ['example.com'],
    defaultCrawlDelayMs: 0,
    requestTimeoutMs: 5_000
  });

  const expected = {
    allowed: false,
    reason: 'Robots.txt is temporarily unavailable for example.com',
    retryable: true
  };
  assert.deepEqual(await policy.check('https://example.com/one'), expected);
  assert.deepEqual(await policy.check('https://example.com/two'), expected);
  assert.equal(requests, 1);
});

test('source request gate cancels an in-flight robots lookup before rate limiting', async () => {
  let observedSignal: AbortSignal | undefined;
  let limiterCalls = 0;
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: {
      get(_url: string, options: { timeoutMs: number; signal?: AbortSignal }): Promise<string> {
        observedSignal = options.signal;
        return new Promise((_resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('robots lookup timed out')), 25);
          options.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true }
          );
        });
      }
    },
    trustedHosts: () => ['example.com'],
    defaultCrawlDelayMs: 0,
    requestTimeoutMs: 5_000
  });
  const gate = new SourceRequestGateService(policy, {
    async wait() {
      limiterCalls += 1;
    }
  });
  const controller = new AbortController();

  const pending = gate.enter('https://example.com/chapter', controller.signal);
  controller.abort();

  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SOURCE_READER_CANCELLED'
  );
  assert.equal(observedSignal?.aborted, true);
  assert.equal(limiterCalls, 0);
});

test('source reader access policy replaces an aborted shared robots load for a new caller', async () => {
  let requests = 0;
  const policy = new RobotsTxtAccessPolicyAdapter({
    http: {
      get(_url: string, options: { timeoutMs: number; signal?: AbortSignal }): Promise<string> {
        requests += 1;
        if (requests > 1) return Promise.resolve('User-agent: *\nAllow: /');
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => {
              setTimeout(() => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
              }, 10);
            },
            { once: true }
          );
        });
      }
    },
    trustedHosts: () => ['example.com'],
    defaultCrawlDelayMs: 0,
    requestTimeoutMs: 5_000
  });
  const controller = new AbortController();
  const cancelled = policy.check('https://example.com/one', controller.signal);

  controller.abort();
  await assert.rejects(
    cancelled,
    (error: unknown) => error instanceof Error && error.name === 'AbortError'
  );

  assert.deepEqual(await policy.check('https://example.com/two'), {
    allowed: true,
    crawlDelayMs: 0
  });
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

test('source rate limiter spaces concurrent requests from actual start times', async () => {
  let now = 0;
  const waits: number[] = [];
  const starts: number[] = [];
  const limiter = new InMemorySourceRateLimiterService({
    now: () => now,
    async sleep(milliseconds) {
      waits.push(milliseconds);
      now += waits.length === 1 ? 200 : milliseconds;
    }
  });

  await limiter.wait('example.test', 100);
  starts.push(now);
  await Promise.all([
    limiter.wait('example.test', 100).then(() => starts.push(now)),
    limiter.wait('example.test', 100).then(() => starts.push(now))
  ]);

  assert.deepEqual(waits, [100, 100]);
  assert.deepEqual(starts, [0, 200, 300]);
});

test('source rate limiter does not keep an aborted future reservation', async () => {
  let now = 0;
  const waits: number[] = [];
  let markAbortSleepStarted!: () => void;
  const abortSleepStarted = new Promise<void>((resolve) => {
    markAbortSleepStarted = resolve;
  });
  const limiter = new InMemorySourceRateLimiterService({
    now: () => now,
    async sleep(milliseconds, signal) {
      waits.push(milliseconds);
      if (!signal) {
        now += milliseconds;
        return;
      }
      markAbortSleepStarted();
      await new Promise<void>((_resolve, reject) => {
        const rejectAbort = () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        };
        if (signal.aborted) rejectAbort();
        else signal.addEventListener('abort', rejectAbort, { once: true });
      });
    }
  });

  await limiter.wait('example.test', 100);
  const controller = new AbortController();
  const aborted = limiter.wait('example.test', 100, controller.signal);
  await abortSleepStarted;
  controller.abort();
  await assert.rejects(
    aborted,
    (error: unknown) => error instanceof Error && error.name === 'AbortError'
  );
  await limiter.wait('example.test', 100);

  assert.deepEqual(waits, [100, 100]);
  assert.equal(now, 100);
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

test('browser parent authorization forwards intercepted URLs and cancellation', async () => {
  const module =
    await import('../../apps/api/src/modules/source-reader/infrastructure/browser/browser-runtime.coordinator.ts');
  const authorizeBrowserRequest = (
    module as unknown as {
      authorizeBrowserRequest?: (
        event: { type: 'authorize-request'; requestId: string; url: string },
        gate: { enter(url: string, signal?: AbortSignal): Promise<void> } | undefined,
        signal: AbortSignal
      ) => Promise<unknown>;
    }
  ).authorizeBrowserRequest;
  assert.equal(typeof authorizeBrowserRequest, 'function');
  const calls: string[] = [];
  const signal = new AbortController().signal;
  const response = await authorizeBrowserRequest!(
    { type: 'authorize-request', requestId: 'request-1', url: 'https://example.test/app.js' },
    {
      async enter(url, observedSignal) {
        assert.equal(observedSignal, signal);
        calls.push(`gate:${url}`);
      }
    },
    signal
  );

  assert.deepEqual(calls, ['gate:https://example.test/app.js']);
  assert.deepEqual(response, {
    type: 'request-authorization-result',
    requestId: 'request-1',
    ok: true
  });
});

test('browser parent authorization returns a denial result without continuing the request', async () => {
  const module =
    await import('../../apps/api/src/modules/source-reader/infrastructure/browser/browser-runtime.coordinator.ts');
  const authorizeBrowserRequest = (
    module as unknown as {
      authorizeBrowserRequest?: (
        event: { type: 'authorize-request'; requestId: string; url: string },
        gate: { enter(url: string, signal?: AbortSignal): Promise<void> } | undefined,
        signal: AbortSignal
      ) => Promise<unknown>;
    }
  ).authorizeBrowserRequest;
  assert.equal(typeof authorizeBrowserRequest, 'function');
  const response = await authorizeBrowserRequest!(
    { type: 'authorize-request', requestId: 'request-2', url: 'https://example.test/private' },
    {
      async enter() {
        throw new Error('Blocked by robots.txt');
      }
    },
    new AbortController().signal
  );

  assert.deepEqual(response, {
    type: 'request-authorization-result',
    requestId: 'request-2',
    ok: false,
    error: 'Blocked by robots.txt'
  });
});

test('browser worker authorizes every allowed request before network continuation', async () => {
  const worker = await readFile(
    'apps/api/src/modules/source-reader/infrastructure/browser/browser-worker.entry.ts',
    'utf8'
  );

  assert.match(
    worker,
    /page\.route\(['"]\*\*\/\*['"][\s\S]*await requestParentAuthorization\(requestUrl\)[\s\S]*await route\.continue\(\)/
  );
  assert.doesNotMatch(worker, /case ['"]open['"][\s\S]*requestParentAuthorization/);
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
