import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceReaderAuthorizationPolicy } from '../../apps/api-legacy/src/modules/source-reader/application/policies/source-reader-authorization.policy.ts';
import { SourceReaderError } from '../../apps/api-legacy/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { sourceReaderActorMiddleware } from '../../apps/api-legacy/src/modules/source-reader/presentation/source-reader-actor.middleware.ts';

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

function actorRequest(options: { isLocal: boolean; authenticated?: boolean; roles?: string }) {
  return {
    apiAccess: {
      isLocal: options.isLocal,
      authenticated: options.authenticated ?? options.isLocal
    },
    header(name: string) {
      if (name === 'x-source-reader-user-id') return 'user-1';
      if (name === 'x-source-reader-roles') return options.roles;
      return undefined;
    }
  };
}

test('actor middleware defaults to reader and grants local administration only when enabled', () => {
  const readOnly = actorRequest({ isLocal: true });
  sourceReaderActorMiddleware({ localAdminEnabled: false, trustRoleHeaders: false })(
    readOnly as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((readOnly as { sourceReaderActor?: unknown }).sourceReaderActor, {
    id: 'user-1',
    roles: ['reader']
  });

  const localAdmin = actorRequest({ isLocal: true });
  sourceReaderActorMiddleware({ localAdminEnabled: true, trustRoleHeaders: false })(
    localAdmin as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((localAdmin as { sourceReaderActor?: unknown }).sourceReaderActor, {
    id: 'user-1',
    roles: ['reader', 'source-manager', 'source-admin', 'system-admin']
  });
});

test('local requests receive a stable actor identity without headers', () => {
  const request = {
    apiAccess: { isLocal: true, authenticated: true },
    header: () => undefined
  };
  sourceReaderActorMiddleware({ localAdminEnabled: false, trustRoleHeaders: false })(
    request as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((request as { sourceReaderActor?: unknown }).sourceReaderActor, {
    id: 'local-user',
    roles: ['reader']
  });
});

test('untrusted remote requests cannot assert a user identity', () => {
  const request = actorRequest({ isLocal: false, authenticated: true });
  sourceReaderActorMiddleware({ localAdminEnabled: false, trustRoleHeaders: false })(
    request as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((request as { sourceReaderActor?: unknown }).sourceReaderActor, {
    roles: ['reader']
  });
});

test('trusted authenticated remote requests may assert identity and roles', () => {
  const request = actorRequest({
    isLocal: false,
    authenticated: true,
    roles: 'source-manager'
  });
  sourceReaderActorMiddleware({ localAdminEnabled: false, trustRoleHeaders: true })(
    request as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((request as { sourceReaderActor?: unknown }).sourceReaderActor, {
    id: 'user-1',
    roles: ['source-manager']
  });
});

test('role headers cannot elevate by default and require authenticated explicit trust remotely', () => {
  const ignored = actorRequest({ isLocal: false, authenticated: true, roles: 'system-admin' });
  sourceReaderActorMiddleware({ localAdminEnabled: true, trustRoleHeaders: false })(
    ignored as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((ignored as { sourceReaderActor?: unknown }).sourceReaderActor, {
    roles: ['reader']
  });

  const unauthenticated = actorRequest({
    isLocal: false,
    authenticated: false,
    roles: 'system-admin'
  });
  sourceReaderActorMiddleware({ localAdminEnabled: true, trustRoleHeaders: true })(
    unauthenticated as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((unauthenticated as { sourceReaderActor?: unknown }).sourceReaderActor, {
    roles: ['reader']
  });

  const trusted = actorRequest({ isLocal: false, authenticated: true, roles: 'source-admin' });
  sourceReaderActorMiddleware({ localAdminEnabled: false, trustRoleHeaders: true })(
    trusted as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((trusted as { sourceReaderActor?: unknown }).sourceReaderActor, {
    id: 'user-1',
    roles: ['source-admin']
  });
});
