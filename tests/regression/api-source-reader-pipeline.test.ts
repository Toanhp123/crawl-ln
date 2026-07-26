import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceReaderFacade } from '../../apps/api/src/modules/source-reader/application/source-reader.facade.ts';
import { CandidateResolver } from '../../apps/api/src/modules/source-reader/application/services/candidate-resolver.ts';
import { HealthFallbackPolicy } from '../../apps/api/src/modules/source-reader/application/services/health-fallback.policy.ts';
import { InvocationCoordinator } from '../../apps/api/src/modules/source-reader/application/services/invocation-coordinator.ts';
import { PaginationCoordinator } from '../../apps/api/src/modules/source-reader/application/services/pagination-coordinator.ts';
import { ReaderCachePolicy } from '../../apps/api/src/modules/source-reader/application/services/reader-cache-policy.ts';
import { SourceResultValidator } from '../../apps/api/src/modules/source-reader/application/services/source-result-validator.ts';
import type {
  SourceReaderCandidate,
  SourceReaderPipelinePorts
} from '../../apps/api/src/modules/source-reader/application/source-reader.ports.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

const sourceUrl = 'https://example.test/book';
const now = new Date('2026-07-21T00:00:00.000Z');

function candidate(pluginId: string, priority: number): SourceReaderCandidate {
  return {
    pluginId,
    pluginVersion: '1.0.0',
    domain: 'example.test',
    normalizedUrl: sourceUrl,
    priority,
    trustLevel: pluginId === 'first-plugin' ? 'built-in' : 'external',
    executionMode: 'in-process',
    contractVersion: 1,
    matcher: { hosts: ['example.test'], capabilities: ['metadata', 'chapter-list'] }
  };
}

function createPipeline(
  options: {
    trace?: string[];
    firstFailure?: SourceReaderError['code'];
    cacheHit?: boolean;
    accessDenied?: boolean;
    accessSignals?: Array<AbortSignal | undefined>;
  } = {}
) {
  const trace = options.trace ?? [];
  const invocationIds: string[] = [];
  const candidates = new CandidateResolver({
    async listCandidates() {
      trace.push('candidate.resolve');
      return [candidate('second-plugin', 10), candidate('first-plugin', 20)];
    },
    async hasAnyCandidate() {
      return true;
    }
  });
  const cacheEntries = new Map<string, unknown>();
  const cache = new ReaderCachePolicy(
    {
      async get(key) {
        trace.push('cache.lookup');
        if (options.cacheHit) {
          return {
            value: {
              data: { title: 'Cached', sourceUrl, sourceName: 'Cache' },
              source: {
                pluginId: 'first-plugin',
                pluginVersion: '1.0.0',
                domain: 'example.test',
                capability: 'metadata'
              }
            },
            expiresAt: now.getTime() + 1_000,
            metadata: { scope: 'public', tags: [] }
          } as never;
        }
        return cacheEntries.get(key) as never;
      },
      async set(key, entry) {
        trace.push('cache.store');
        cacheEntries.set(key, entry);
      }
    },
    { now: () => now }
  );
  const ports: SourceReaderPipelinePorts = {
    contexts: {
      async resolve() {
        trace.push('context.resolve');
        return { cacheIdentity: { public: 'public', network: 'direct' } };
      }
    },
    validator: {
      validate(_capability, data) {
        trace.push('result.validate');
        return { data };
      }
    }
  };
  const invocation = new InvocationCoordinator({
    async invoke(input) {
      trace.push('invoke');
      invocationIds.push(input.candidate.pluginId);
      if (input.candidate.pluginId === 'first-plugin' && options.firstFailure) {
        throw new SourceReaderError(options.firstFailure, 'first failed', {
          retryable: true,
          fallbackAllowed: true
        });
      }
      return {
        data: {
          title: input.candidate.pluginId,
          sourceUrl,
          sourceName: 'Example'
        },
        cacheHints: { scope: 'public', ttlMs: 1_000 }
      };
    }
  });
  const health = new HealthFallbackPolicy(
    {
      async isEligible() {
        return true;
      },
      async recordSuccess() {
        trace.push('health.success');
      },
      async recordFailure() {
        trace.push('health.failure');
      }
    },
    { now: () => now }
  );
  const pagination = new PaginationCoordinator(
    {
      encode: (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url'),
      decode: (token) => JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
    },
    { now: () => now }
  );
  const facade = new SourceReaderFacade({
    requestGate: {
      async assertAllowed(url, signal) {
        trace.push(`access.assert:${url}`);
        options.accessSignals?.push(signal);
        if (options.accessDenied) {
          throw new SourceReaderError('NETWORK_ACCESS_BLOCKED', 'Source access denied', {
            retryable: false,
            fallbackAllowed: false
          });
        }
      }
    },
    candidates,
    cache,
    invocation,
    pagination,
    health,
    ...ports
  });
  return { facade, invocationIds, trace };
}

test('facade executes candidate, context, cache, invocation, validation and health stages in order', async () => {
  const trace: string[] = [];
  const { facade } = createPipeline({ trace });

  await facade.readMetadata({ url: sourceUrl });

  assert.deepEqual(trace, [
    `access.assert:${sourceUrl}`,
    'candidate.resolve',
    'context.resolve',
    'cache.lookup',
    'invoke',
    'result.validate',
    'health.success',
    'cache.store'
  ]);
});

test('facade forwards request cancellation to the source access gate', async () => {
  const accessSignals: Array<AbortSignal | undefined> = [];
  const signal = new AbortController().signal;
  const { facade } = createPipeline({ accessSignals });

  await facade.readMetadata({ url: sourceUrl, signal });

  assert.deepEqual(accessSignals, [signal]);
});

test('typed fallback advances only when policy allows it', async () => {
  const allowed = createPipeline({ firstFailure: 'SOURCE_TEMPORARILY_UNAVAILABLE' });
  const result = await allowed.facade.readMetadata({ url: sourceUrl });
  assert.equal(result.source.pluginId, 'second-plugin');
  assert.deepEqual(allowed.invocationIds, ['first-plugin', 'second-plugin']);

  const denied = createPipeline({ firstFailure: 'AUTHENTICATION_REQUIRED' });
  await assert.rejects(
    () => denied.facade.readMetadata({ url: sourceUrl }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'AUTHENTICATION_REQUIRED'
  );
  assert.deepEqual(denied.invocationIds, ['first-plugin']);
});

test('fresh cache hit returns before health and invocation stages', async () => {
  const scenario = createPipeline({ cacheHit: true });

  const result = await scenario.facade.readMetadata({ url: sourceUrl });

  assert.equal(result.data.title, 'Cached');
  assert.deepEqual(scenario.invocationIds, []);
  assert.deepEqual(scenario.trace, [
    `access.assert:${sourceUrl}`,
    'candidate.resolve',
    'context.resolve',
    'cache.lookup'
  ]);
});

test('source access policy is enforced before candidate resolution and cache lookup', async () => {
  const scenario = createPipeline({ cacheHit: true, accessDenied: true });

  await assert.rejects(
    () => scenario.facade.readMetadata({ url: sourceUrl }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'NETWORK_ACCESS_BLOCKED'
  );

  assert.deepEqual(scenario.trace, [`access.assert:${sourceUrl}`]);
  assert.deepEqual(scenario.invocationIds, []);
});

test('pagination rejects plugin pages that cannot make progress', () => {
  const pagination = new PaginationCoordinator(
    { encode: () => 'signed', decode: () => ({}) as never },
    { now: () => now }
  );

  assert.throws(
    () =>
      pagination.applyPage({
        capability: 'chapter-list',
        candidate: candidate('first-plugin', 1),
        request: { url: sourceUrl, limit: 10 },
        page: { items: [], hasMore: true }
      }),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'PLUGIN_RESULT_INVALID'
  );
});

test('result validation enforces required extensions and omits invalid optional extensions', () => {
  const validator = new SourceResultValidator();
  const validate = validator.validate.bind(validator) as (
    capability: 'metadata',
    data: unknown,
    extensions: unknown,
    candidate: unknown
  ) => { warnings?: Array<{ code: string }> };
  const data = { title: 'Novel', sourceUrl, sourceName: 'Example' };
  const requiredCandidate = {
    ...candidate('first-plugin', 1),
    extensionContracts: {
      required: {
        version: '1',
        required: true,
        validate: (value: unknown) => ({ success: true as const, data: value })
      }
    }
  };
  assert.throws(
    () => validate('metadata', data, undefined, requiredCandidate),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'PLUGIN_RESULT_INVALID'
  );

  const optionalCandidate = {
    ...candidate('first-plugin', 1),
    extensionContracts: {
      optional: {
        version: '1',
        required: false,
        validate: () => ({
          success: false as const,
          issues: [{ path: '/', message: 'invalid' }]
        })
      }
    }
  };
  const optional = validate(
    'metadata',
    data,
    { optional: { version: 1, data: { bad: true } } },
    optionalCandidate
  );
  assert.deepEqual(
    optional.warnings?.map((warning) => warning.code),
    ['PLUGIN_EXTENSION_OMITTED']
  );
});
