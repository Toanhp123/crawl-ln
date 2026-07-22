import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWebContracts } from '../../scripts/lib/web-contracts.mjs';

test('current frontend satisfies frozen HTTP contracts', async () => {
  assert.deepEqual(await checkWebContracts('apps/web/src'), []);
});

test('next frontend satisfies frozen HTTP contracts', async () => {
  assert.deepEqual(await checkWebContracts('apps/web-next/src'), []);
});
