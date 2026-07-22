import assert from 'node:assert/strict';
import test from 'node:test';

test('query persistence accepts only the intended exact key shapes', async () => {
  const policy =
    (await import('../../apps/web-next/src/app/providers/query-persistence.ts')) as Record<
      string,
      unknown
    >;
  assert.equal(typeof policy.shouldPersistAppQueryKey, 'function');
  if (typeof policy.shouldPersistAppQueryKey !== 'function') return;

  const shouldPersistAppQueryKey = policy.shouldPersistAppQueryKey as (
    queryKey: readonly unknown[]
  ) => boolean;
  assert.equal(shouldPersistAppQueryKey(['novels', 'list', { limit: 12 }]), true);
  assert.equal(shouldPersistAppQueryKey(['tasks', 'summary']), true);
  assert.equal(shouldPersistAppQueryKey(['scheduler', 'status']), true);
  assert.equal(shouldPersistAppQueryKey(['source-reader', 'plugins']), true);
  assert.equal(shouldPersistAppQueryKey(['source-reader', 'plugins', 'plugin-1']), false);
  assert.equal(
    shouldPersistAppQueryKey(['source-reader', 'plugins', 'plugin-1', 'permissions']),
    false
  );
});
