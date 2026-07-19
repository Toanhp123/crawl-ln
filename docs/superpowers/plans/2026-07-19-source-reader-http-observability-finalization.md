# Source Reader HTTP, Observability, and Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Source Reader product surface with secured public/admin APIs, typed transport errors, plugin and runtime observability, resilience policies, Sources UI migration, architecture enforcement, documentation cleanup, and final verification.

**Architecture:** Keep TypeScript façade calls primary and expose only authorized application use cases over HTTP. Controllers map application results to transport DTOs, admin operations pass through an actor/role policy, diagnostics are redacted, metrics avoid high-cardinality labels, and circuit/rate policies wrap invocation without leaking into plugins. Update the existing Sources UI to `/api/source-reader/*`, then lock the architecture and delete stale docs/contracts.

**Tech Stack:** TypeScript 5.5, Express 4, React 18/Vite, TanStack Query, Node test runner, Playwright, existing realtime broker.

## Global Constraints

- HTTP clients cannot select arbitrary plugin IDs for reader operations, execution mode, worker path, raw proxy URL, raw cookie, token, or password.
- Reader endpoints are `/api/source-reader/identify`, `/metadata`, `/chapter-list`, `/chapter-content`, `/search`, and `/latest-updates`.
- Admin APIs cover plugin installation/lifecycle/permissions/health, credential profiles, network profiles, and auth challenges.
- Roles are `reader`, `source-manager`, `source-admin`, and `system-admin`.
- Transport uses stable `SourceReaderErrorCode`; frontend never parses error messages.
- Logs and diagnostics redact passwords, OTPs, cookies, authorization headers, proxy credentials, sensitive query values, and raw chapter content.
- Metrics labels are limited to plugin ID, capability, result, and runtime mode.
- Circuit health is per plugin + capability + domain + network-route class; user auth failures do not degrade plugin health.
- Final repository contains no `/api/plugins`, SourceProfile, old plugin module, or stale documentation instructing users to configure them.

---

### Task 1: Add actor context and authorization policy

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/source-reader-actor.port.ts`
- Create: `apps/api/src/modules/source-reader/application/policies/source-reader-authorization.policy.ts`
- Create: `apps/api/src/modules/source-reader/presentation/source-reader-actor.middleware.ts`
- Modify: `apps/api/src/shared/config/env.ts`
- Test: `tests/regression/source-reader-authorization.test.ts`

**Interfaces:**
- Consumes: HTTP headers or trusted deployment identity mapping.
- Produces: `SourceReaderActor`, `requireRole()`, ownership checks, and request-local actor context used by all HTTP use cases.

- [ ] **Step 1: Write failing role and ownership tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SourceReaderAuthorizationPolicy
} from '../../apps/api/src/modules/source-reader/application/policies/source-reader-authorization.policy.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

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

test('only source-admin or system-admin can install plugins', () => {
  assert.throws(() => policy.requireRole({ id: 'user-1', roles: ['source-manager'] }, 'source-admin'));
  policy.requireRole({ id: 'admin-1', roles: ['source-admin'] }, 'source-admin');
});
```

- [ ] **Step 2: Run the test and verify missing policy**

Run:

```bash
node --import tsx --test tests/regression/source-reader-authorization.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define actor contract**

```ts
// source-reader-actor.port.ts
export type SourceReaderRole =
  | 'reader'
  | 'source-manager'
  | 'source-admin'
  | 'system-admin';

export interface SourceReaderActor {
  id?: string;
  roles: SourceReaderRole[];
}
```

- [ ] **Step 4: Implement authorization policy**

```ts
// source-reader-authorization.policy.ts
import type {
  SourceReaderActor,
  SourceReaderRole
} from '../ports/source-reader-actor.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

const impliedRoles: Record<SourceReaderRole, SourceReaderRole[]> = {
  reader: ['reader'],
  'source-manager': ['reader', 'source-manager'],
  'source-admin': ['reader', 'source-manager', 'source-admin'],
  'system-admin': ['reader', 'source-manager', 'source-admin', 'system-admin']
};

export class SourceReaderAuthorizationPolicy {
  requireRole(actor: SourceReaderActor, required: SourceReaderRole): void {
    const effective = new Set(actor.roles.flatMap((role) => impliedRoles[role]));
    if (!effective.has(required)) this.denied(`Role ${required} is required`);
  }

  assertCredentialAccess(
    actor: SourceReaderActor,
    resource: { ownerType: 'system' | 'user'; ownerId?: string }
  ): void {
    if (resource.ownerType === 'system') return this.requireRole(actor, 'system-admin');
    this.requireRole(actor, 'source-manager');
    if (!actor.id || actor.id !== resource.ownerId) this.denied('Credential belongs to another user');
  }

  assertNetworkAccess(
    actor: SourceReaderActor,
    resource: { ownerType: 'system' | 'user'; ownerId?: string }
  ): void {
    this.assertCredentialAccess(actor, resource);
  }

  private denied(message: string): never {
    throw new SourceReaderError('PLUGIN_PERMISSION_DENIED', message, {
      retryable: false,
      fallbackAllowed: false
    });
  }
}
```

- [ ] **Step 5: Implement request actor middleware for current self-hosted deployment**

```ts
// source-reader-actor.middleware.ts
import type { NextFunction, Request, Response } from 'express';
import type {
  SourceReaderActor,
  SourceReaderRole
} from '../application/ports/source-reader-actor.port.js';

export interface SourceReaderRequest extends Request {
  sourceReaderActor?: SourceReaderActor;
}

export function sourceReaderActorMiddleware(defaultRoles: SourceReaderRole[]) {
  return (request: SourceReaderRequest, _response: Response, next: NextFunction) => {
    const id = request.header('x-source-reader-user-id') || undefined;
    const requested = request
      .header('x-source-reader-roles')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) as SourceReaderRole[] | undefined;
    request.sourceReaderActor = {
      id,
      roles: requested?.length ? requested : defaultRoles
    };
    next();
  };
}
```

Use deployment configuration, not client-controlled elevated roles, in production:

```ts
sourceReaderDefaultRoles:
  jsonEnv<SourceReaderRole[]>('SOURCE_READER_DEFAULT_ROLES_JSON', [
    'reader',
    'source-manager',
    'source-admin',
    'system-admin'
  ]),
sourceReaderTrustRoleHeaders: boolEnv('SOURCE_READER_TRUST_ROLE_HEADERS', false)
```

When `sourceReaderTrustRoleHeaders` is false, ignore role headers and use configured roles.

- [ ] **Step 6: Run authorization tests and typecheck**

Run:

```bash
node --import tsx --test tests/regression/source-reader-authorization.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit authorization boundary**

```bash
git add apps/api/src/modules/source-reader/application/ports/source-reader-actor.port.ts apps/api/src/modules/source-reader/application/policies/source-reader-authorization.policy.ts apps/api/src/modules/source-reader/presentation/source-reader-actor.middleware.ts apps/api/src/shared/config/env.ts tests/regression/source-reader-authorization.test.ts
git commit -m "feat(source-reader): authorize reader administration"
```

---

### Task 2: Complete reader, plugin, credential, network, and challenge use cases

**Files:**
- Create: `apps/api/src/modules/source-reader/application/use-cases/plugins/manage-source-plugins.usecase.ts`
- Create: `apps/api/src/modules/source-reader/application/use-cases/credentials/manage-credentials.usecase.ts`
- Create: `apps/api/src/modules/source-reader/application/use-cases/network/manage-network-profiles.usecase.ts`
- Create: `apps/api/src/modules/source-reader/application/use-cases/auth-challenges/manage-auth-challenges.usecase.ts`
- Modify: `apps/api/src/modules/source-reader/public/source-reader.api.ts`
- Test: `tests/regression/source-reader-management-usecases.test.ts`

**Interfaces:**
- Consumes: policy, plugin installation/store/health, credential/network repositories, authentication/challenge services.
- Produces: explicit application use cases for controllers; controllers never call repositories, vault, worker, or browser runtime directly.

- [ ] **Step 1: Write failing management use-case tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { InstallSourcePluginUseCase } from '../../apps/api/src/modules/source-reader/application/use-cases/plugins/manage-source-plugins.usecase.ts';

const policy = { requireRole: (_actor: unknown, role: string) => assert.equal(role, 'source-admin') };
const installer = {
  install: async () => ({ installationId: 'i1', pluginId: 'demo', version: '1.0.0', status: 'pending-approval' })
};

test('plugin installation requires source-admin and returns no package path', async () => {
  const result = await new InstallSourcePluginUseCase(policy as never, installer as never).execute({
    actor: { id: 'admin', roles: ['source-admin'] },
    bytes: Buffer.from('package'),
    originalName: 'demo.source-plugin'
  });
  assert.deepEqual(result, {
    installationId: 'i1',
    pluginId: 'demo',
    version: '1.0.0',
    status: 'pending-approval'
  });
  assert.equal('packagePath' in result, false);
});
```

- [ ] **Step 2: Implement plugin administration use cases**

```ts
// manage-source-plugins.usecase.ts
export class InstallSourcePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly installations: PluginInstallationService
  ) {}
  execute(input: { actor: SourceReaderActor; bytes: Uint8Array; originalName: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    return this.installations.install({ bytes: input.bytes, originalName: input.originalName });
  }
}

export class ApprovePluginPermissionsUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: PluginStorePort,
    private readonly clock: ClockPort
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string; version: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.approvePermissions({
      pluginId: input.pluginId,
      pluginVersion: input.version,
      approvedBy: input.actor.id ?? 'system',
      approvedAt: this.clock.now().toISOString()
    });
  }
}

export class ListPluginsUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: PluginStorePort
  ) {}
  execute(input: { actor: SourceReaderActor }) {
    this.authorization.requireRole(input.actor, 'reader');
    return this.store.listInstalled();
  }
}

export class EnablePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: PluginStorePort,
    private readonly clock: ClockPort
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string; version: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.activate(input.pluginId, input.version, this.clock.now().toISOString());
  }
}

export class DisablePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: PluginStorePort
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.disable(input.pluginId);
  }
}

export class RemovePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: PluginStorePort
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.remove(input.pluginId);
  }
}

export class TestPluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly health: PluginHealthService
  ) {}
  execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    return this.health.runPluginHealthCheck(input.pluginId);
  }
}

export class GetPluginHealthUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly health: PluginHealthService
  ) {}
  execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'reader');
    return this.health.describePlugin(input.pluginId);
  }
}

export class QuarantinePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: PluginStorePort
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string; version: string; reason: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.quarantine(input.pluginId, input.version, input.reason);
  }
}
```

- [ ] **Step 3: Implement credential management use cases**

```ts
export class CreateCredentialUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly credentials: CredentialRepository,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort
  ) {}

  async execute(input: {
    actor: SourceReaderActor;
    ownerType: 'system' | 'user';
    pluginId?: string;
    domain?: string;
    name: string;
    strategy: CredentialHandle['strategy'];
    secret: Record<string, unknown>;
  }) {
    const ownerId = input.ownerType === 'user' ? input.actor.id : undefined;
    this.authorization.assertCredentialAccess(input.actor, {
      ownerType: input.ownerType,
      ownerId
    });
    const now = this.clock.now().toISOString();
    const id = this.ids.next();
    await this.credentials.save({
      id,
      ownerType: input.ownerType,
      ownerId,
      pluginId: input.pluginId,
      domain: input.domain,
      name: input.name,
      strategy: input.strategy,
      secret: input.secret,
      enabled: true,
      createdAt: now,
      updatedAt: now
    });
    return { id, name: input.name, ownerType: input.ownerType, ownerId, strategy: input.strategy };
  }
}
```

Add the following concrete use cases to the same file:

```ts
export class ListCredentialsUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly credentials: CredentialRepository
  ) {}
  execute(input: { actor: SourceReaderActor }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.credentials.listMetadata({ ownerId: input.actor.id, includeSystem: input.actor.roles.includes('system-admin') });
  }
}

export class UpdateCredentialSecretUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly credentials: CredentialRepository,
    private readonly sessions: SessionRepository,
    private readonly clock: ClockPort
  ) {}
  async execute(input: { actor: SourceReaderActor; credentialId: string; secret: Record<string, unknown> }) {
    const handle = await this.credentials.requireHandle(input.credentialId);
    this.authorization.assertCredentialAccess(input.actor, handle);
    await this.credentials.updateSecret(input.credentialId, input.secret, this.clock.now().toISOString());
    await this.sessions.revokeByCredential(input.credentialId);
  }
}

export class DeleteCredentialUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly credentials: CredentialRepository,
    private readonly sessions: SessionRepository
  ) {}
  async execute(input: { actor: SourceReaderActor; credentialId: string }) {
    const handle = await this.credentials.requireHandle(input.credentialId);
    this.authorization.assertCredentialAccess(input.actor, handle);
    await this.sessions.revokeByCredential(input.credentialId);
    await this.credentials.delete(input.credentialId);
  }
}

export class LoginCredentialUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly authentication: SourceAuthenticationService
  ) {}
  execute(input: { actor: SourceReaderActor; credentialId: string; networkProfileId?: string }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.authentication.login({ userId: input.actor.id, credentialId: input.credentialId, networkProfileId: input.networkProfileId });
  }
}

export class LogoutCredentialUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly authentication: SourceAuthenticationService
  ) {}
  execute(input: { actor: SourceReaderActor; credentialId: string }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.authentication.logout({ userId: input.actor.id, credentialId: input.credentialId });
  }
}

export class TestCredentialUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly authentication: SourceAuthenticationService
  ) {}
  execute(input: { actor: SourceReaderActor; credentialId: string; networkProfileId?: string }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.authentication.test({ userId: input.actor.id, credentialId: input.credentialId, networkProfileId: input.networkProfileId });
  }
}
```

Returned DTOs contain metadata only. Tests must assert that `secret`, ciphertext, encryption metadata, cookie values, and tokens are absent.

- [ ] **Step 4: Implement network profile use cases**

```ts
interface NetworkProfileTestResult {
  status: 'healthy' | 'degraded' | 'offline';
  region?: string;
  latencyMs: number;
  checkedAt: string;
}

export class CreateNetworkProfileUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly profiles: NetworkProfileRepository,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort
  ) {}
  async execute(input: CreateNetworkProfileInput) {
    const ownerId = input.ownerType === 'user' ? input.actor.id : undefined;
    this.authorization.assertNetworkProfileAccess(input.actor, { ownerType: input.ownerType, ownerId });
    const id = this.ids.next();
    await this.profiles.save({ ...input, id, ownerId, createdAt: this.clock.now().toISOString() });
    return { id, name: input.name, ownerType: input.ownerType, ownerId, routeType: input.routeType };
  }
}

export class ListNetworkProfilesUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly profiles: NetworkProfileRepository
  ) {}
  execute(input: { actor: SourceReaderActor }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.profiles.listMetadata({ ownerId: input.actor.id, includeSystem: input.actor.roles.includes('system-admin') });
  }
}

export class UpdateNetworkProfileUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly profiles: NetworkProfileRepository
  ) {}
  async execute(input: UpdateNetworkProfileInput) {
    const current = await this.profiles.requireHandle(input.profileId);
    this.authorization.assertNetworkProfileAccess(input.actor, current);
    await this.profiles.update(input.profileId, input.patch);
  }
}

export class DeleteNetworkProfileUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly profiles: NetworkProfileRepository,
    private readonly sessions: SessionRepository
  ) {}
  async execute(input: { actor: SourceReaderActor; profileId: string }) {
    const current = await this.profiles.requireHandle(input.profileId);
    this.authorization.assertNetworkProfileAccess(input.actor, current);
    await this.sessions.revokeByNetworkProfile(input.profileId);
    await this.profiles.delete(input.profileId);
  }
}

export class TestNetworkProfileUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly tester: NetworkProfileTester
  ) {}
  execute(input: { actor: SourceReaderActor; profileId: string }): Promise<NetworkProfileTestResult> {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.tester.test(input.profileId, input.actor.id);
  }
}
```

`assertNetworkProfileAccess()` requires `system-admin` for system-owned profiles and `source-manager` plus matching `ownerId` for user-owned profiles.

- [ ] **Step 5: Implement challenge management use cases**

```ts
export class RespondAuthChallengeUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly challenges: AuthChallengeService
  ) {}
  execute(input: {
    actor: SourceReaderActor;
    challengeId: string;
    response: Record<string, unknown>;
  }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.challenges.respond({
      challengeId: input.challengeId,
      ownerId: input.actor.id,
      response: input.response
    });
  }
}
```

- [ ] **Step 6: Expose management APIs only through public module interfaces**

```ts
// Add to source-reader.api.ts
export interface SourceReaderManagementApi {
  plugins: {
    list: { execute(input: { actor: SourceReaderActor }): Promise<unknown[]> };
    install: InstallSourcePluginUseCase;
    approvePermissions: ApprovePluginPermissionsUseCase;
    enable: EnablePluginUseCase;
    disable: DisablePluginUseCase;
    remove: RemovePluginUseCase;
    test: TestPluginUseCase;
    health: GetPluginHealthUseCase;
  };
  credentials: { /* explicit use-case interfaces */ };
  networkProfiles: { /* explicit use-case interfaces */ };
  authChallenges: { /* explicit use-case interfaces */ };
}
```

- [ ] **Step 7: Run management tests and architecture check**

Run:

```bash
node --import tsx --test tests/regression/source-reader-management-usecases.test.ts
npm run check:arch
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 8: Commit application management layer**

```bash
git add apps/api/src/modules/source-reader/application/use-cases apps/api/src/modules/source-reader/public/source-reader.api.ts tests/regression/source-reader-management-usecases.test.ts
git commit -m "feat(source-reader): add secured management use cases"
```

---

### Task 3: Implement complete HTTP controllers, DTOs, routes, multipart install, and typed errors

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Modify: `apps/api/src/modules/source-reader/presentation/dto/source-reader.dto.ts`
- Modify: `apps/api/src/modules/source-reader/presentation/controllers/source-reader.controller.ts`
- Create: `apps/api/src/modules/source-reader/presentation/controllers/source-reader-admin.controller.ts`
- Modify: `apps/api/src/modules/source-reader/presentation/routes/source-reader.routes.ts`
- Modify: `apps/api/src/app/http/error-middleware.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Test: `tests/integration/source-reader-admin-http.test.ts`
- Test: `tests/regression/source-reader-http-contract.test.ts`

**Interfaces:**
- Consumes: `SourceReaderApi`, `SourceReaderManagementApi`, actor middleware.
- Produces: all approved reader/admin endpoints and redacted transport DTOs.

- [ ] **Step 1: Add bounded multipart parser dependency**

Run:

```bash
npm install multer@^2.0.0 -w @novel-tool/api
npm install -D @types/multer@^1.4.12 -w @novel-tool/api
```

Expected: API package and lockfile contain `multer` and type declarations.

- [ ] **Step 2: Write failing HTTP contract tests**

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('source reader routes expose approved surface and never raw invocation controls', async () => {
  const routes = await readFile(
    'apps/api/src/modules/source-reader/presentation/routes/source-reader.routes.ts',
    'utf8'
  );
  for (const path of [
    '/identify',
    '/metadata',
    '/chapter-list',
    '/chapter-content',
    '/search',
    '/latest-updates',
    '/plugins',
    '/credentials',
    '/network-profiles',
    '/auth/challenges'
  ]) assert.match(routes, new RegExp(path.replace('/', '\\/')));
  assert.doesNotMatch(routes, /invokePluginRaw|resolveSecrets|spawnWorker|openBrowserContext/);
});
```

- [ ] **Step 3: Extend DTO schemas**

```ts
export const searchRequestSchema = sourceUrlRequestSchema.extend({
  query: z.string().min(1).max(200),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional()
});

export const credentialRequestSchema = z.object({
  ownerType: z.enum(['system', 'user']),
  pluginId: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  name: z.string().min(1).max(100),
  strategy: z.enum(['cookie-import', 'bearer-token', 'basic-auth', 'form-login', 'custom']),
  secret: z.record(z.unknown())
});

export const networkProfileRequestSchema = z.object({
  ownerType: z.enum(['system', 'user']),
  name: z.string().min(1).max(100),
  routeType: z.enum(['direct', 'http-proxy', 'socks-proxy', 'vpn-gateway']),
  regions: z.array(z.string().min(2)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  config: z.record(z.unknown()).optional()
});

export const authChallengeResponseSchema = z.object({
  response: z.discriminatedUnion('type', [
    z.object({ type: z.literal('otp'), code: z.string().min(1).max(32) }),
    z.object({ type: z.literal('approval'), approved: z.boolean() }),
    z.object({ type: z.literal('browser-interaction'), completed: z.boolean() })
  ])
});
```

- [ ] **Step 4: Implement reader controller search/latest methods and actor propagation**

```ts
search = async (req: SourceReaderRequest, res: Response) =>
  ok(
    res,
    await this.api.search({
      ...validate(searchRequestSchema, req.body),
      userId: req.sourceReaderActor?.id
    })
  );

latestUpdates = async (req: SourceReaderRequest, res: Response) =>
  ok(
    res,
    await this.api.latestUpdates({
      ...validate(chapterListRequestSchema, req.body),
      userId: req.sourceReaderActor?.id
    })
  );
```

Every reader method must overwrite `userId` from actor context; never trust `userId` in request body.

- [ ] **Step 5: Implement admin controller with redacted outputs**

```ts
// source-reader-admin.controller.ts
export class SourceReaderAdminController {
  constructor(private readonly management: SourceReaderManagementApi) {}

  listPlugins = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.plugins.list.execute({ actor: requireActor(req) }));

  installPlugin = async (req: SourceReaderRequest, res: Response) => {
    if (!req.file) throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'Plugin package is required', {
      retryable: false,
      fallbackAllowed: false
    });
    return accepted(
      res,
      await this.management.plugins.install.execute({
        actor: requireActor(req),
        bytes: req.file.buffer,
        originalName: req.file.originalname
      })
    );
  };

  createCredential = async (req: SourceReaderRequest, res: Response) =>
    accepted(
      res,
      await this.management.credentials.create.execute({
        actor: requireActor(req),
        ...validate(credentialRequestSchema, req.body)
      })
    );

  listCredentials = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.credentials.list.execute({ actor: requireActor(req) }));

  updateCredential = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.credentials.updateSecret.execute({
      actor: requireActor(req),
      credentialId: req.params.id,
      secret: validate(credentialSecretSchema, req.body).secret
    }));

  deleteCredential = async (req: SourceReaderRequest, res: Response) =>
    noContent(res, await this.management.credentials.remove.execute({ actor: requireActor(req), credentialId: req.params.id }));

  loginCredential = async (req: SourceReaderRequest, res: Response) =>
    accepted(res, await this.management.credentials.login.execute({ actor: requireActor(req), credentialId: req.params.id, ...validate(credentialLoginSchema, req.body) }));

  logoutCredential = async (req: SourceReaderRequest, res: Response) =>
    noContent(res, await this.management.credentials.logout.execute({ actor: requireActor(req), credentialId: req.params.id }));

  testCredential = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.credentials.test.execute({ actor: requireActor(req), credentialId: req.params.id, ...validate(credentialLoginSchema, req.body) }));

  listNetworkProfiles = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.networkProfiles.list.execute({ actor: requireActor(req) }));

  createNetworkProfile = async (req: SourceReaderRequest, res: Response) =>
    accepted(res, await this.management.networkProfiles.create.execute({ actor: requireActor(req), ...validate(networkProfileCreateSchema, req.body) }));

  updateNetworkProfile = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.networkProfiles.update.execute({ actor: requireActor(req), profileId: req.params.id, patch: validate(networkProfileUpdateSchema, req.body) }));

  deleteNetworkProfile = async (req: SourceReaderRequest, res: Response) =>
    noContent(res, await this.management.networkProfiles.remove.execute({ actor: requireActor(req), profileId: req.params.id }));

  testNetworkProfile = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.networkProfiles.test.execute({ actor: requireActor(req), profileId: req.params.id }));

  enablePlugin = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.plugins.enable.execute({ actor: requireActor(req), pluginId: req.params.pluginId, version: validate(pluginVersionSchema, req.body).version }));

  disablePlugin = async (req: SourceReaderRequest, res: Response) =>
    noContent(res, await this.management.plugins.disable.execute({ actor: requireActor(req), pluginId: req.params.pluginId }));

  removePlugin = async (req: SourceReaderRequest, res: Response) =>
    noContent(res, await this.management.plugins.remove.execute({ actor: requireActor(req), pluginId: req.params.pluginId }));

  testPlugin = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.plugins.test.execute({ actor: requireActor(req), pluginId: req.params.pluginId }));

  pluginHealth = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.plugins.health.execute({ actor: requireActor(req), pluginId: req.params.pluginId }));

  listPermissions = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.plugins.listPermissions.execute({ actor: requireActor(req), pluginId: req.params.pluginId }));

  approvePermissions = async (req: SourceReaderRequest, res: Response) =>
    noContent(res, await this.management.plugins.approvePermissions.execute({ actor: requireActor(req), pluginId: req.params.pluginId, version: validate(pluginVersionSchema, req.body).version }));

  denyPermissions = async (req: SourceReaderRequest, res: Response) =>
    noContent(res, await this.management.plugins.denyPermissions.execute({ actor: requireActor(req), pluginId: req.params.pluginId, version: validate(pluginVersionSchema, req.body).version }));

  listChallenges = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.challenges.list.execute({ actor: requireActor(req) }));

  getChallenge = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.challenges.get.execute({ actor: requireActor(req), challengeId: req.params.id }));

  respondChallenge = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.challenges.respond.execute({ actor: requireActor(req), challengeId: req.params.id, response: validate(challengeResponseSchema, req.body).response }));

  cancelChallenge = async (req: SourceReaderRequest, res: Response) =>
    noContent(res, await this.management.challenges.cancel.execute({ actor: requireActor(req), challengeId: req.params.id }));
}
```

- [ ] **Step 6: Implement all routes with a 20 MB in-memory upload limit**

```ts
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 }
});

router.use(sourceReaderActorMiddleware(defaultRoles));
router.post('/identify', asyncHandler(reader.identify));
router.post('/metadata', asyncHandler(reader.metadata));
router.post('/chapter-list', asyncHandler(reader.chapterList));
router.post('/chapter-content', asyncHandler(reader.chapterContent));
router.post('/search', asyncHandler(reader.search));
router.post('/latest-updates', asyncHandler(reader.latestUpdates));

router.get('/plugins', asyncHandler(admin.listPlugins));
router.post('/plugins/install', upload.single('plugin'), asyncHandler(admin.installPlugin));
router.post('/plugins/:pluginId/enable', asyncHandler(admin.enablePlugin));
router.post('/plugins/:pluginId/disable', asyncHandler(admin.disablePlugin));
router.delete('/plugins/:pluginId', asyncHandler(admin.removePlugin));
router.post('/plugins/:pluginId/test', asyncHandler(admin.testPlugin));
router.get('/plugins/:pluginId/health', asyncHandler(admin.pluginHealth));
router.get('/plugins/:pluginId/permissions', asyncHandler(admin.listPermissions));
router.post('/plugins/:pluginId/permissions/approve', asyncHandler(admin.approvePermissions));
router.post('/plugins/:pluginId/permissions/deny', asyncHandler(admin.denyPermissions));

router.get('/credentials', asyncHandler(admin.listCredentials));
router.post('/credentials', asyncHandler(admin.createCredential));
router.patch('/credentials/:id', asyncHandler(admin.updateCredential));
router.delete('/credentials/:id', asyncHandler(admin.deleteCredential));
router.post('/credentials/:id/login', asyncHandler(admin.loginCredential));
router.post('/credentials/:id/logout', asyncHandler(admin.logoutCredential));
router.post('/credentials/:id/test', asyncHandler(admin.testCredential));

router.get('/network-profiles', asyncHandler(admin.listNetworkProfiles));
router.post('/network-profiles', asyncHandler(admin.createNetworkProfile));
router.patch('/network-profiles/:id', asyncHandler(admin.updateNetworkProfile));
router.delete('/network-profiles/:id', asyncHandler(admin.deleteNetworkProfile));
router.post('/network-profiles/:id/test', asyncHandler(admin.testNetworkProfile));

router.get('/auth/challenges', asyncHandler(admin.listChallenges));
router.get('/auth/challenges/:id', asyncHandler(admin.getChallenge));
router.post('/auth/challenges/:id/respond', asyncHandler(admin.respondChallenge));
router.post('/auth/challenges/:id/cancel', asyncHandler(admin.cancelChallenge));
```

- [ ] **Step 7: Complete stable HTTP status mapping**

```ts
const sourceReaderStatus: Partial<Record<SourceReaderErrorCode, number>> = {
  SOURCE_NOT_SUPPORTED: 422,
  CAPABILITY_NOT_SUPPORTED: 422,
  PLUGIN_RESULT_INVALID: 422,
  CURSOR_INVALID: 400,
  CURSOR_INVALIDATED: 409,
  AUTHENTICATION_REQUIRED: 401,
  AUTHENTICATION_FAILED: 401,
  CREDENTIAL_NOT_CONFIGURED: 401,
  PLUGIN_PERMISSION_DENIED: 403,
  PLUGIN_NETWORK_PERMISSION_DENIED: 403,
  NETWORK_ACCESS_BLOCKED: 403,
  AUTH_CHALLENGE_REQUIRED: 409,
  AUTH_CHALLENGE_EXPIRED: 409,
  SOURCE_RATE_LIMITED: 429,
  SOURCE_REQUEST_TIMEOUT: 504,
  SOURCE_TEMPORARILY_UNAVAILABLE: 502,
  PLUGIN_UNAVAILABLE: 503,
  NETWORK_ROUTE_OFFLINE: 503,
  SECRET_VAULT_UNAVAILABLE: 503,
  SOURCE_READER_CANCELLED: 499
};
```

Transport payload:

```ts
return fail(res, status, error.code, error.message, {
  retryable: error.retryable,
  requestId: requestIdFrom(res),
  ...(error.details ? { details: redactDetails(error.details) } : {})
});
```

- [ ] **Step 8: Run HTTP contract, admin integration, smoke, and frontend contract tests**

Run:

```bash
node --import tsx --test tests/regression/source-reader-http-contract.test.ts
npm run build:shared && node --experimental-sqlite --import tsx --test \
  tests/integration/source-reader-admin-http.test.ts \
  tests/integration/source-reader-http.test.ts \
  tests/integration/api-smoke.test.ts
npm run check:web-contracts
```

Expected: PASS.

- [ ] **Step 9: Commit complete HTTP API**

```bash
git add apps/api/package.json package-lock.json apps/api/src/modules/source-reader/presentation apps/api/src/app/http/error-middleware.ts apps/api/src/shared/container/modules/source-reader.module.ts tests/integration/source-reader-admin-http.test.ts tests/regression/source-reader-http-contract.test.ts
git commit -m "feat(source-reader): expose secured management API"
```

---

### Task 4: Add request correlation, redaction, metrics, circuit breakers, and invocation rate limits

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/source-reader-observability.port.ts`
- Create: `apps/api/src/modules/source-reader/application/services/source-reader-circuit-breaker.ts`
- Create: `apps/api/src/modules/source-reader/application/services/source-reader-rate-limiter.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/observability/source-reader-observability.ts`
- Create: `apps/api/src/modules/source-reader/presentation/source-reader-request-id.middleware.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Modify: `apps/api/src/modules/source-reader/presentation/routes/source-reader.routes.ts`
- Test: `tests/regression/source-reader-observability.test.ts`
- Test: `tests/regression/source-reader-circuit-breaker.test.ts`

**Interfaces:**
- Consumes: logger, clock, request actor, invocation attempts.
- Produces: request/invocation correlation, redacted logs, bounded metric labels, circuit eligibility, per-domain/account/route concurrency and pacing.

- [ ] **Step 1: Write failing redaction and circuit tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { redactSourceReaderValue } from '../../apps/api/src/modules/source-reader/infrastructure/observability/source-reader-observability.ts';
import { SourceReaderCircuitBreaker } from '../../apps/api/src/modules/source-reader/application/services/source-reader-circuit-breaker.ts';

test('redaction removes auth query values, cookies, OTP, and authorization headers', () => {
  assert.deepEqual(
    redactSourceReaderValue({
      url: 'https://example.test/book?token=secret&chapter=1',
      headers: { authorization: 'Bearer secret', cookie: 'sid=secret' },
      otp: '123456',
      chapter: 1
    }),
    {
      url: 'https://example.test/book?token=%5BREDACTED%5D&chapter=1',
      headers: { authorization: '[REDACTED]', cookie: '[REDACTED]' },
      otp: '[REDACTED]',
      chapter: 1
    }
  );
});

test('auth failures do not open the shared plugin circuit', () => {
  const breaker = new SourceReaderCircuitBreaker({ failureThreshold: 3, openMs: 60_000 });
  for (let index = 0; index < 10; index += 1) {
    breaker.recordFailure('demo:metadata:example.test:direct', 'AUTHENTICATION_FAILED', 0);
  }
  assert.equal(breaker.allow('demo:metadata:example.test:direct', 0), true);
});
```

- [ ] **Step 2: Define observability port and safe label model**

```ts
export interface SourceReaderObservabilityPort {
  invocationStarted(input: {
    requestId: string;
    invocationId: string;
    pluginId: string;
    capability: SourceCapability;
    domain: string;
    runtimeMode: 'in-process' | 'isolated';
  }): void;
  invocationFinished(input: {
    requestId: string;
    invocationId: string;
    pluginId: string;
    capability: SourceCapability;
    runtimeMode: 'in-process' | 'isolated';
    result: 'success' | 'failed' | 'skipped';
    durationMs: number;
    failureCode?: SourceReaderErrorCode;
  }): void;
  cacheHit(input: { pluginId: string; capability: SourceCapability; stale: boolean }): void;
  fallback(input: { pluginId: string; capability: SourceCapability; failureCode: string }): void;
}
```

No method accepts full URL, user ID, credential ID, session ID, or raw route ID as a metric label.

- [ ] **Step 3: Implement recursive redaction and in-process counters**

```ts
const sensitiveKeys = new Set([
  'password',
  'token',
  'access_token',
  'authorization',
  'cookie',
  'set-cookie',
  'otp',
  'code',
  'signature',
  'session',
  'proxyPassword'
]);

export function redactSourceReaderValue(value: unknown, key?: string): unknown {
  if (key && sensitiveKeys.has(key.toLowerCase())) return '[REDACTED]';
  if (typeof value === 'string' && key === 'url') {
    const url = new URL(value);
    for (const parameter of ['token', 'access_token', 'auth', 'key', 'signature', 'session', 'code']) {
      if (url.searchParams.has(parameter)) url.searchParams.set(parameter, '[REDACTED]');
    }
    return url.toString();
  }
  if (Array.isArray(value)) return value.map((item) => redactSourceReaderValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        redactSourceReaderValue(child, childKey)
      ])
    );
  }
  return value;
}
```

Implement counters named:

```text
source_reader_invocations_total
source_reader_invocation_duration_ms
source_reader_errors_total
source_reader_fallbacks_total
source_reader_cache_hits_total
source_reader_cache_stale_hits_total
source_reader_worker_restarts_total
source_reader_auth_challenges_total
source_reader_active_sessions
source_reader_network_route_health
```

- [ ] **Step 4: Implement circuit breaker**

```ts
export class SourceReaderCircuitBreaker {
  private readonly states = new Map<
    string,
    { failures: number; openedAt?: number; halfOpenProbe: boolean }
  >();

  constructor(
    private readonly policy: { failureThreshold: number; openMs: number }
  ) {}

  allow(key: string, now: number): boolean {
    const state = this.states.get(key);
    if (!state?.openedAt) return true;
    if (now - state.openedAt < this.policy.openMs) return false;
    if (state.halfOpenProbe) return false;
    state.halfOpenProbe = true;
    return true;
  }

  recordSuccess(key: string): void {
    this.states.delete(key);
  }

  recordFailure(key: string, code: string, now: number): void {
    if (code.startsWith('AUTH') || code === 'CREDENTIAL_NOT_CONFIGURED') return;
    const state = this.states.get(key) ?? { failures: 0, halfOpenProbe: false };
    state.failures += 1;
    state.halfOpenProbe = false;
    if (state.failures >= this.policy.failureThreshold) state.openedAt = now;
    this.states.set(key, state);
  }
}
```

- [ ] **Step 5: Implement invocation rate limiter**

```ts
export class SourceReaderRateLimiter {
  private readonly active = new Map<string, number>();
  private readonly lastStartedAt = new Map<string, number>();

  constructor(
    private readonly policy: { maxConcurrent: number; minimumDelayMs: number }
  ) {}

  async enter(key: string, signal: AbortSignal): Promise<() => void> {
    while ((this.active.get(key) ?? 0) >= this.policy.maxConcurrent) {
      if (signal.aborted) throw cancelledError();
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const delay = Math.max(
      0,
      (this.lastStartedAt.get(key) ?? 0) + this.policy.minimumDelayMs - Date.now()
    );
    if (delay > 0) await abortableDelay(delay, signal);
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    this.lastStartedAt.set(key, Date.now());
    return () => this.active.set(key, Math.max(0, (this.active.get(key) ?? 1) - 1));
  }
}
```

Key composition:

```ts
const rateKey = `${candidate.domain}:${runtimeContext.credential?.id ?? 'anonymous'}:${
  runtimeContext.networkRoute?.id ?? 'direct'
}`;
```

Do not use this raw key as a metric label.

- [ ] **Step 6: Wrap SourceReaderService candidate attempts**

```ts
const circuitKey = `${pluginId}:${capability}:${candidate.domain}:${
  runtimeContext.networkRoute?.routeType ?? 'direct'
}`;
if (!this.circuit.allow(circuitKey, Date.now())) continue;
const leave = await this.rateLimiter.enter(rateKey, signal);
const invocationId = randomUUID();
const started = performance.now();
this.observability.invocationStarted({ requestId, invocationId, pluginId, capability, domain: candidate.domain, runtimeMode: candidate.executionMode });
try {
  const result = await this.runtime.invoke(...);
  this.circuit.recordSuccess(circuitKey);
  this.observability.invocationFinished({ requestId, invocationId, pluginId, capability, runtimeMode: candidate.executionMode, result: 'success', durationMs: performance.now() - started });
  return result;
} catch (error) {
  const code = error instanceof SourceReaderError ? error.code : 'SOURCE_READER_INTERNAL_ERROR';
  this.circuit.recordFailure(circuitKey, code, Date.now());
  this.observability.invocationFinished({ requestId, invocationId, pluginId, capability, runtimeMode: candidate.executionMode, result: 'failed', durationMs: performance.now() - started, failureCode: code });
  throw error;
} finally {
  leave();
}
```

- [ ] **Step 7: Add request ID middleware**

```ts
export function sourceReaderRequestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
) {
  const requestId = request.header('x-request-id') || randomUUID();
  response.locals.sourceReaderRequestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
```

Register before actor middleware and Source Reader routes.

- [ ] **Step 8: Run observability, circuit, concurrency, and production-safety tests**

Run:

```bash
node --import tsx --test \
  tests/regression/source-reader-observability.test.ts \
  tests/regression/source-reader-circuit-breaker.test.ts \
  tests/regression/backend-concurrency-safety.test.ts \
  tests/regression/backend-production-safety.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 9: Commit resilience and observability**

```bash
git add apps/api/src/modules/source-reader/application/ports/source-reader-observability.port.ts apps/api/src/modules/source-reader/application/services/source-reader-circuit-breaker.ts apps/api/src/modules/source-reader/application/services/source-reader-rate-limiter.ts apps/api/src/modules/source-reader/application/services/source-reader.service.ts apps/api/src/modules/source-reader/infrastructure/observability apps/api/src/modules/source-reader/presentation/source-reader-request-id.middleware.ts apps/api/src/modules/source-reader/presentation/routes/source-reader.routes.ts tests/regression/source-reader-observability.test.ts tests/regression/source-reader-circuit-breaker.test.ts
git commit -m "feat(source-reader): add resilience and observability"
```

---

### Task 5: Migrate Sources UI and shared web contracts to Source Reader endpoints

**Files:**
- Modify: `apps/web/src/features/manage-source-plugins/api/sourcePlugins.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/pages/sources/ui/SourcesPage.tsx`
- Modify: `apps/web/src/pages/sources/model/useSourcesPage.ts`
- Modify: `apps/web/src/shared/api/queryKeys.ts`
- Modify: `apps/web/src/shared/i18n/locales/en.ts`
- Modify: `apps/web/src/shared/i18n/locales/vi.ts`
- Delete: none; rewrite `apps/web/src/features/manage-source-plugins/api/sourcePlugins.ts` in place so no `/api/plugins` caller remains
- Test: `tests/regression/source-reader-web-contract.test.ts`
- Test: `tests/e2e/source-reader-sources-page.spec.ts`

**Interfaces:**
- Consumes: `/api/source-reader/plugins`, permission, health, enable/disable, credentials, network profiles, and challenges endpoints.
- Produces: Sources page using the new API, preserving optimistic switch behavior.

- [ ] **Step 1: Write the failing web contract test against the current exact files**

Create:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const files = [
  'apps/web/src/features/manage-source-plugins/api/sourcePlugins.ts',
  'apps/web/src/pages/sources/model/useSourcesPage.ts',
  'apps/web/src/pages/sources/ui/SourceProfileCard.tsx'
];

test('Sources UI uses Source Reader API and retains optimistic switches', () => {
  const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.match(source, /source-reader\/plugins/);
  assert.match(source, /onMutate/);
  assert.match(source, /onError/);
  assert.doesNotMatch(source, /\/api\/plugins/);
  assert.match(source, /onCheckedChange/);
  assert.doesNotMatch(source, /\/api\/plugins(?:\/|['"])/);
});
```

- [ ] **Step 2: Run the contract test and verify old endpoint references**

Run:

```bash
node --import tsx --test tests/regression/source-reader-web-contract.test.ts
```

Expected: FAIL because `apps/web/src/features/manage-source-plugins/api/sourcePlugins.ts` still calls `/api/plugins` and the card reads `plugin.manifest.*`.

- [ ] **Step 3: Replace `SourcePluginDescriptor` in `packages/shared/src/index.ts` with the web-facing Source Reader descriptor**

```ts
export interface SourceReaderPluginDescriptor {
  id: string;
  name: string;
  activeVersion?: string;
  trustLevel: 'built-in' | 'signed' | 'local-unverified' | 'blocked';
  status:
    | 'installed'
    | 'pending-approval'
    | 'initializing'
    | 'active'
    | 'degraded'
    | 'disabled'
    | 'quarantined'
    | 'failed';
  enabled: boolean;
  capabilities: string[];
  domains: string[];
  permissionsPending: boolean;
  health?: {
    status: 'healthy' | 'degraded' | 'failed';
    lastCheckedAt?: string;
  };
}
```

- [ ] **Step 4: Rewrite `apps/web/src/features/manage-source-plugins/api/sourcePlugins.ts` with Source Reader API calls**

```ts
import type { SourceReaderPluginDescriptor } from '@novel-tool/shared';
import { http } from '@/shared/api/http';

export type SourcePlugin = SourceReaderPluginDescriptor;

export const listSourcePlugins = (signal?: AbortSignal) =>
  http<SourceReaderPluginDescriptor[]>('/api/source-reader/plugins', { signal });
export const setSourcePluginEnabled = (id: string, enabled: boolean) =>
  http<SourceReaderPluginDescriptor>(
    `/api/source-reader/plugins/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`,
    { method: 'POST' }
  );
export const testSourcePlugin = (id: string) =>
  http(`/api/source-reader/plugins/${encodeURIComponent(id)}/test`, { method: 'POST' });
export const getSourcePluginHealth = (id: string) =>
  http(`/api/source-reader/plugins/${encodeURIComponent(id)}/health`);
export const listSourceCredentials = () => http('/api/source-reader/credentials');
export const listSourceNetworkProfiles = () => http('/api/source-reader/network-profiles');
export const listSourceAuthChallenges = () => http('/api/source-reader/auth/challenges');
```

- [ ] **Step 5: Preserve optimistic switch rollback**

```ts
const togglePlugin = useMutation({
  mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
    setSourcePluginEnabled(id, enabled),
  onMutate: async ({ id, enabled }) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.sourcePlugins });
    const previous = queryClient.getQueryData<SourceReaderPluginDescriptor[]>(
      queryKeys.sourcePlugins
    );
    queryClient.setQueryData<SourceReaderPluginDescriptor[]>(
      queryKeys.sourcePlugins,
      (current = []) =>
        current.map((plugin) =>
          plugin.id === id
            ? { ...plugin, enabled, status: enabled ? 'initializing' : 'disabled' }
            : plugin
        )
    );
    return { previous };
  },
  onError: (_error, _variables, context) => {
    queryClient.setQueryData(queryKeys.sourcePlugins, context?.previous);
  },
  onSettled: () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.sourcePlugins })
});
```

- [ ] **Step 6: Update `SourceProfileCard.tsx`, `SourcesPage.tsx`, query keys, and both locale files**

Replace `plugin.manifest.name`, `plugin.manifest.match`, and old counter-based health fields with `plugin.name`, `plugin.domains`, `plugin.activeVersion`, `plugin.trustLevel`, `plugin.capabilities`, `plugin.permissionsPending`, and `plugin.health?.status`. Keep the existing `Switch` and `ActionState` wiring. Add `queryKeys.sourceReaderCredentials`, `queryKeys.sourceReaderNetworkProfiles`, and `queryKeys.sourceReaderChallenges`; preserve `queryKeys.sourcePlugins` for the plugin list to minimize unrelated churn. Add English and Vietnamese labels for trust, permissions pending, capabilities, domains, credentials, network profiles, and auth challenges. Do not render secret values, proxy endpoints, stack traces, or filesystem paths.

- [ ] **Step 7: Add E2E coverage**

```ts
import { expect, test } from '@playwright/test';

test('Sources page loads Source Reader plugins and rolls back a failed switch', async ({ page }) => {
  await page.route('**/api/source-reader/plugins', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: {
          data: [
            {
              id: 'novelcool',
              name: 'NovelCool',
              activeVersion: '1.0.0',
              trustLevel: 'built-in',
              status: 'active',
              enabled: true,
              capabilities: ['metadata', 'chapter-list', 'chapter-content'],
              domains: ['novelcool.com'],
              permissionsPending: false
            }
          ],
          error: null
        }
      });
    }
    return route.continue();
  });
  await page.route('**/api/source-reader/plugins/novelcool/disable', (route) =>
    route.fulfill({ status: 503, json: { data: null, error: { code: 'PLUGIN_UNAVAILABLE', message: 'failed' } } })
  );
  await page.goto('/sources');
  const toggle = page.getByRole('switch', { name: /NovelCool/i });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
});
```

- [ ] **Step 8: Run web contract, optimistic switch, web typecheck, and E2E**

Run:

```bash
node --import tsx --test \
  tests/regression/source-reader-web-contract.test.ts \
  tests/regression/async-switch-controls.test.ts
npm run check -w @novel-tool/web
npx playwright test tests/e2e/source-reader-sources-page.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit web migration**

```bash
git add apps/web/src tests/regression/source-reader-web-contract.test.ts tests/e2e/source-reader-sources-page.spec.ts
git commit -m "refactor(web): manage sources through source reader"
```

---

### Task 6: Lock architecture, clean documentation, and run final acceptance

**Files:**
- Modify: `scripts/check-api-architecture.mjs`
- Modify: `scripts/check-crawler-platform.mjs`
- Modify: `scripts/check-web-contracts.mjs`
- Modify: `README.md`
- Modify: `docs/SOURCE_PROFILE.md` if present, replacing or deleting it
- Create: `docs/SOURCE_READER.md`
- Modify: `CHANGELOG.md`
- Test: `tests/regression/source-reader-final-lockdown.test.ts`

**Interfaces:**
- Consumes: completed Source Reader backend and web migration.
- Produces: automated dependency rules, current operator/plugin-author documentation, and final clean repository.

- [ ] **Step 1: Write failing final-lockdown test**

```ts
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('repository documents and enforces only Source Reader', () => {
  const readme = readFileSync('README.md', 'utf8');
  const sourceReader = readFileSync('docs/SOURCE_READER.md', 'utf8');
  assert.match(readme, /Source Reader/);
  assert.match(sourceReader, /\.source-plugin/);
  assert.match(sourceReader, /SOURCE_READER_MASTER_KEY/);
  assert.doesNotMatch(readme, /SOURCE_PROFILES_FILE|source-profiles\.json|\/api\/plugins/);
  assert.equal(existsSync('apps/api/config/source-profiles.json'), false);
  assert.equal(existsSync('apps/api/src/modules/plugin'), false);
});
```

- [ ] **Step 2: Add Source Reader architecture rules**

Add to `scripts/check-api-architecture.mjs`:

```js
if (
  sourceModule &&
  sourceModule !== 'source-reader' &&
  target.includes('/modules/source-reader/') &&
  !target.includes('/modules/source-reader/public/')
) {
  violations.push(
    `${normalizedPath}: imports Source Reader internals; depend only on modules/source-reader/public/*: ${target}`
  );
}

if (
  normalizedPath.includes('/modules/source-reader/') &&
  !normalizedPath.includes('/presentation/') &&
  /\b(?:INSERT|UPDATE|DELETE)\s+(?:novels|chapters|crawl_tasks)\b/i.test(source)
) {
  violations.push(
    `${normalizedPath}: Source Reader must not persist novels, chapters, or crawl tasks`
  );
}
```

Add composition `source-reader.module.ts` to the public-facade module list and require `satisfies SourceReaderApi` plus `satisfies SourceReaderManagementApi`.

- [ ] **Step 3: Update crawler platform checks**

```js
const forbiddenCrawlerSourceSymbols = [
  'SourceAdapter',
  'SourceDetector',
  'SourceProfile',
  'SelectorHtmlAdapter',
  'PluginSourceAdapter',
  'CrawlerEngineService'
];
for (const symbol of forbiddenCrawlerSourceSymbols) {
  if (crawlerSource.includes(symbol)) violations.push(`crawler retains removed source symbol ${symbol}`);
}
if (!crawlerModule.includes('sourceReader.api')) {
  violations.push('crawler is not composed with SourceReaderApi');
}
```

- [ ] **Step 4: Update web contract checks**

```js
if (webSource.includes('/api/plugins')) {
  violations.push('web retains removed /api/plugins endpoint');
}
if (!webSource.includes('/source-reader/plugins')) {
  violations.push('Sources UI does not use Source Reader plugin endpoint');
}
```

- [ ] **Step 5: Write current Source Reader documentation**

`docs/SOURCE_READER.md` must include concrete sections:

```text
architecture and module boundary
built-in and external plugins
capability and matcher contract
.source-plugin package layout
contract and extension versions
trust levels and permission approval
master-key generation and degraded mode
auth strategies and challenge behavior
network profiles and VPN-gateway abstraction
cache scopes and invalidation
HTTP reader/admin endpoints
error codes
plugin development workflow
verification commands
```

Master key command:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Do not document CAPTCHA bypass, raw secret APIs, or a way to force plugin execution.

- [ ] **Step 6: Remove or replace stale Source Profile documentation and environment examples**

Run:

```bash
rg -n "SOURCE_PROFILES_FILE|source-profiles\.json|SelectorHtmlAdapter|PluginSourceAdapter|/api/plugins|modules/plugin" README.md docs CHANGELOG.md apps tests scripts
```

Expected before cleanup: only historical changelog/spec references and current design migration notes. Replace operational instructions with Source Reader equivalents. Historical entries may remain when clearly labeled as old versions.

- [ ] **Step 7: Run final lockdown and all static checks**

Run:

```bash
node --import tsx --test tests/regression/source-reader-final-lockdown.test.ts
npm run check:arch
npm run check:crawler
npm run check:web-arch
npm run check:web-contracts
npm run format:check
```

Expected: PASS.

- [ ] **Step 8: Run complete acceptance suite**

Run:

```bash
npm run verify
npm run test:e2e
```

Expected: both commands exit `0`.

- [ ] **Step 9: Perform final forbidden-symbol scan**

Run:

```bash
rg -n "SourceProfile|JsonSourceProfileRepository|SourceDetectorService|SelectorHtmlAdapter|PluginSourceAdapter|SourceAdapter|createPluginModule|/api/plugins|SOURCE_PROFILES_FILE|SOURCES_DIR" apps tests scripts README.md docs
```

Expected: no production, test, script, or current documentation match. The approved design and implementation plans may mention removed symbols because they describe the migration; exclude `docs/superpowers/` when evaluating the final runtime repository:

```bash
rg -n --glob '!docs/superpowers/**' "SourceProfile|JsonSourceProfileRepository|SourceDetectorService|SelectorHtmlAdapter|PluginSourceAdapter|SourceAdapter|createPluginModule|/api/plugins|SOURCE_PROFILES_FILE|SOURCES_DIR" apps tests scripts README.md docs
```

Expected: no output.

- [ ] **Step 10: Commit finalization**

```bash
git add scripts README.md docs CHANGELOG.md tests/regression/source-reader-final-lockdown.test.ts
git commit -m "docs(source-reader): lock final platform architecture"
```

## Plan completion gate

Run:

```bash
npm run verify
npm run test:e2e
```

Expected: both commands exit `0`. The backend starts without source profiles, all source reads and plugin administration use Source Reader, untrusted plugins are isolated, secrets remain encrypted/redacted, Sources UI uses the new endpoints, and architecture scripts reject any reintroduction of the removed paths.
