import assert from 'node:assert/strict';
import test from 'node:test';
import { RobotsTxtAccessPolicyAdapter } from '../../apps/api/src/modules/ingestion/infrastructure/robots-txt-access-policy.adapter.ts';
import { createEnvironment } from '../../apps/api/src/platform/config/environment.ts';

test('api environment exposes crawler policy settings', () => {
  const environment = createEnvironment({
    SOURCE_ALLOWLIST: 'NovelCool.com, www.Example.com',
    CRAWLER_DELAY_MS: '1250'
  });

  assert.deepEqual(environment.sourceAllowlist, ['novelcool.com', 'www.example.com']);
  assert.equal(environment.crawlerDelayMs, 1_250);
});

test('ingestion access policy denies hosts outside the source allowlist', async () => {
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

test('ingestion access policy honors the longest robots rule and crawl delay', async () => {
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

test('ingestion access policy refetches robots rules after cache expiry', async () => {
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
