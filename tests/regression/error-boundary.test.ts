import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('business and application failures are module-owned and HTTP mapping stays at the app boundary', () => {
  assert.equal(existsSync(resolve('apps/api/src/shared/errors/app-error.ts')), false);
  assert.equal(existsSync(resolve('apps/api/src/shared/errors/http-error.ts')), false);
  assert.equal(existsSync(resolve('apps/api-legacy/src/shared/errors/app-error.ts')), false);
  assert.equal(existsSync(resolve('apps/api-legacy/src/shared/errors/http-error.ts')), false);

  const legacyGuard = readFileSync(resolve('scripts/check-api-legacy-architecture.mjs'), 'utf8');
  assert.match(legacyGuard, /shared\/errors/);
  assert.match(legacyGuard, /application errors must be module-owned/);

  const canonicalMiddleware = readFileSync(
    resolve('apps/api/src/platform/http/error.middleware.ts'),
    'utf8'
  );
  assert.match(canonicalMiddleware, /function applicationFailureResponse/);

  const legacyMiddleware = readFileSync(
    resolve('apps/api-legacy/src/app/http/error-middleware.ts'),
    'utf8'
  );
  assert.match(legacyMiddleware, /function mapApplicationFailure/);
});
