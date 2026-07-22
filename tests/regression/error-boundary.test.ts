import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('business and application failures are module-owned and HTTP mapping stays at the app boundary', () => {
  assert.equal(existsSync(resolve('apps/api-legacy/src/shared/errors/app-error.ts')), false);
  assert.equal(existsSync(resolve('apps/api-legacy/src/shared/errors/http-error.ts')), false);

  const guard = readFileSync(resolve('scripts/check-api-architecture.mjs'), 'utf8');
  assert.match(guard, /shared\/errors/);
  assert.match(guard, /application errors must be module-owned/);

  const middleware = readFileSync(
    resolve('apps/api-legacy/src/app/http/error-middleware.ts'),
    'utf8'
  );
  assert.match(middleware, /function mapApplicationFailure/);
});
