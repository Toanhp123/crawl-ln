import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const requiredEvidence = {
  sandbox: 'tests/regression/source-reader-external-process-sandbox.test.ts',
  routing: 'tests/integration/source-reader-network-routing.test.ts',
  cacheIdentity: 'tests/integration/source-reader-cache-scope-identity.test.ts',
  sessionBinding: 'tests/integration/source-reader-session-binding.test.ts',
  lifecycle: 'tests/integration/source-plugin-lifecycle-activation.test.ts',
  compatibility: 'tests/regression/source-plugin-compatibility.test.ts',
  externalAuth: 'tests/integration/source-reader-external-auth-rpc.test.ts',
  extensions: 'tests/regression/source-reader-extension-validation.test.ts',
  invalidation: 'tests/integration/source-reader-cache-invalidation.test.ts',
  logging: 'tests/regression/source-reader-structured-logging.test.ts',
  migration: 'tests/integration/source-reader-fail-closed-migration.test.ts'
} as const;

test('every approved remediation invariant has behavioral evidence', () => {
  for (const [invariant, path] of Object.entries(requiredEvidence)) {
    assert.equal(existsSync(path), true, `${invariant}: missing ${path}`);
    const source = readFileSync(path, 'utf8');
    assert.match(source, /\b(?:assert\.|expect\()/, `${invariant}: no behavioral assertion`);
    assert.match(source, /\btest\(/, `${invariant}: no executable test`);
  }
});

test('final remediation contains no legacy worker runtime or permissive cache identity', () => {
  assert.equal(
    existsSync('apps/api-legacy/src/modules/source-reader/infrastructure/runtime/isolated-worker'),
    false
  );
  const service = readFileSync(
    'apps/api-legacy/src/modules/source-reader/application/services/source-reader.service.ts',
    'utf8'
  );
  assert.doesNotMatch(service, /\bauthScope\b/);
  const validators = readFileSync(
    'apps/api-legacy/src/modules/source-reader/application/services/plugin-result-validator.ts',
    'utf8'
  );
  assert.doesNotMatch(validators, /z\.array\(z\.unknown\(\)\)/);
  const sandboxSchema = readFileSync(
    'apps/api-legacy/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.schema.ts',
    'utf8'
  );
  assert.doesNotMatch(sandboxSchema, /z\.array\(z\.unknown\(\)\)/);
});
