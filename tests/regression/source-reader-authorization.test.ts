import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceReaderAuthorizationPolicy } from '../../apps/api/src/modules/source-reader/application/policies/source-reader-authorization.policy.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { sourceReaderActorMiddleware } from '../../apps/api/src/modules/source-reader/presentation/source-reader-actor.middleware.ts';

const policy = new SourceReaderAuthorizationPolicy();

test('source-manager may manage own credential but not a system credential', () => {
  const actor = { id: 'user-1', roles: ['reader', 'source-manager'] as const };
  policy.assertCredentialAccess(actor, { ownerType: 'user', ownerId: 'user-1' });
  assert.throws(
    () => policy.assertCredentialAccess(actor, { ownerType: 'system' }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_PERMISSION_DENIED'
  );
});

test('only source-admin or system-admin can perform source-admin operations', () => {
  assert.throws(
    () => policy.requireRole({ id: 'user-1', roles: ['source-manager'] }, 'source-admin'),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_PERMISSION_DENIED'
  );
  policy.requireRole({ id: 'admin-1', roles: ['source-admin'] }, 'source-admin');
  policy.requireRole({ id: 'root-1', roles: ['system-admin'] }, 'source-admin');
});

test('actor middleware ignores client role headers unless deployment explicitly trusts them', () => {
  const request = {
    header(name: string) {
      if (name === 'x-source-reader-user-id') return 'user-1';
      if (name === 'x-source-reader-roles') return 'system-admin';
      return undefined;
    }
  };
  let nextCalls = 0;
  sourceReaderActorMiddleware({
    defaultRoles: ['reader', 'source-manager'],
    trustRoleHeaders: false
  })(request as never, {} as never, () => {
    nextCalls += 1;
  });
  assert.deepEqual((request as { sourceReaderActor?: unknown }).sourceReaderActor, {
    id: 'user-1',
    roles: ['reader', 'source-manager']
  });

  sourceReaderActorMiddleware({
    defaultRoles: ['reader'],
    trustRoleHeaders: true
  })(request as never, {} as never, () => {
    nextCalls += 1;
  });
  assert.deepEqual((request as { sourceReaderActor?: unknown }).sourceReaderActor, {
    id: 'user-1',
    roles: ['system-admin']
  });
  assert.equal(nextCalls, 2);
});
