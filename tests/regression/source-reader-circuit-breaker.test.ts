import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceReaderCircuitBreaker } from '../../apps/api-legacy/src/modules/source-reader/application/services/source-reader-circuit-breaker.ts';

test('auth failures do not open the shared plugin circuit', () => {
  const breaker = new SourceReaderCircuitBreaker({ failureThreshold: 3, openMs: 60_000 });
  for (let index = 0; index < 10; index += 1) {
    breaker.recordFailure('demo:metadata:example.test:direct', 'AUTHENTICATION_FAILED', 0);
  }
  assert.equal(breaker.allow('demo:metadata:example.test:direct', 0), true);
});

test('eligible failures open then permit one half-open probe', () => {
  const breaker = new SourceReaderCircuitBreaker({ failureThreshold: 2, openMs: 100 });
  const key = 'demo:metadata:example.test:direct';
  breaker.recordFailure(key, 'SOURCE_REQUEST_TIMEOUT', 0);
  breaker.recordFailure(key, 'SOURCE_REQUEST_TIMEOUT', 1);
  assert.equal(breaker.allow(key, 50), false);
  assert.equal(breaker.allow(key, 101), true);
  assert.equal(breaker.allow(key, 102), false);
  breaker.recordSuccess(key);
  assert.equal(breaker.allow(key, 102), true);
});
