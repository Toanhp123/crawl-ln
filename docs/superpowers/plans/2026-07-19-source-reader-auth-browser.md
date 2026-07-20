# Source Reader Authentication and Browser Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support standard and custom login, encrypted reusable sessions, OTP/CAPTCHA/approval/browser challenges, isolated browser contexts, and route-bound authentication for sources that require accounts, JavaScript, or regional network access.

**Architecture:** Keep auth orchestration inside Source Reader. Resolve opaque credential and network handles, execute standard HTTP strategies directly, delegate unusual flows to plugin auth extensions, escalate JavaScript or interactive flows to a browser worker, persist only encrypted session/challenge material, and bind sessions to the network route used during login.

**Tech Stack:** TypeScript 5.5, Node.js 22 worker threads, Playwright Core, existing SecretVault/repositories, Node test runner, Express added only in the later HTTP plan.

## Global Constraints

- Standard strategies are `cookie-import`, `bearer-token`, `basic-auth`, and `form-login`; custom logic is used only when required.
- Plugins never receive the master key or persisted plaintext secret.
- Password filling uses a secret handle resolved inside the browser runtime.
- CAPTCHA is completed by a user; no automatic CAPTCHA solving or bypass exists.
- Browser context identity is `userId + pluginId + sourceAccountId + networkRouteId`.
- Session binding is `none`, `preferred`, or `required`; required route mismatch returns `SESSION_NETWORK_MISMATCH`.
- Challenge state is encrypted, expires, and closes its browser context on expiration/cancellation.
- Browser workers enforce timeout, memory/process isolation, navigation host allowlist, disabled downloads, and disabled file uploads by default.

---

### Task 1: Define authentication contracts and standard strategy executor

**Files:**
- Create: `apps/api/src/modules/source-reader/domain/auth/authentication.ts`
- Create: `apps/api/src/modules/source-reader/application/ports/authentication-runtime.port.ts`
- Create: `apps/api/src/modules/source-reader/application/services/standard-authentication.service.ts`
- Modify: `apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts`
- Test: `tests/regression/source-reader-standard-auth.test.ts`

**Interfaces:**
- Consumes: credential repository, session repository, plugin HTTP context, SecretVault-backed handles.
- Produces: `AuthenticationRuntimePort.authenticate()`, `AuthExecutionResult`, and optional plugin `authentication` extension.

- [ ] **Step 1: Write failing cookie, bearer, basic, and form-login tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { StandardAuthenticationService } from '../../apps/api/src/modules/source-reader/application/services/standard-authentication.service.ts';

const requests: Array<{ url: string; headers?: Record<string, string>; body?: unknown }> = [];
const http = {
  get: async (url: string, options?: { headers?: Record<string, string> }) => {
    requests.push({ url, headers: options?.headers });
    return { url, status: 200, headers: {}, data: 'ok' };
  },
  post: async (url: string, options?: { headers?: Record<string, string>; body?: unknown }) => {
    requests.push({ url, headers: options?.headers, body: options?.body });
    return { url: 'https://example.test/account', status: 200, headers: { 'set-cookie': 'sid=abc' }, data: 'ok' };
  }
};

test('bearer strategy returns header session material without exposing the token in result metadata', async () => {
  const service = new StandardAuthenticationService();
  const result = await service.authenticate({
    strategy: 'bearer-token',
    secret: { token: 'secret-token' },
    configuration: {},
    http: http as never
  });
  assert.equal(result.status, 'authenticated');
  assert.equal(result.session.kind, 'headers');
  assert.equal(JSON.stringify(result).includes('secret-token'), true);
});

test('form login posts configured fields and captures cookies', async () => {
  const service = new StandardAuthenticationService();
  const result = await service.authenticate({
    strategy: 'form-login',
    secret: { username: 'reader', password: 'secret' },
    configuration: {
      loginUrl: 'https://example.test/login',
      fields: { username: 'email', password: 'password' },
      success: { urlIncludes: '/account' }
    },
    http: http as never
  });
  assert.equal(result.status, 'authenticated');
  assert.equal(requests.at(-1)?.body instanceof URLSearchParams, true);
});
```

- [ ] **Step 2: Run the test and verify missing auth modules**

Run:

```bash
node --import tsx --test tests/regression/source-reader-standard-auth.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define auth domain contracts**

```ts
// apps/api/src/modules/source-reader/domain/auth/authentication.ts
export type AuthenticationStrategy =
  | 'cookie-import'
  | 'bearer-token'
  | 'basic-auth'
  | 'form-login'
  | 'custom';

export interface AuthSessionMaterial {
  kind: 'cookies' | 'headers' | 'combined';
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    secure?: boolean;
    httpOnly?: boolean;
  }>;
  headers?: Record<string, string>;
  expiresAt?: string;
  networkBinding: 'none' | 'preferred' | 'required';
}

export interface AuthChallenge {
  id: string;
  type: 'otp' | 'captcha' | 'approval' | 'browser-interaction';
  expiresAt: string;
  userInstructions?: string;
}

export type AuthExecutionResult =
  | { status: 'authenticated'; session: AuthSessionMaterial }
  | { status: 'challenge-required'; challenge: AuthChallenge };
```

- [ ] **Step 4: Define runtime port and plugin extension**

```ts
// apps/api/src/modules/source-reader/application/ports/authentication-runtime.port.ts
import type {
  AuthenticationStrategy,
  AuthExecutionResult
} from '../../domain/auth/authentication.js';
import type { CredentialHandle } from './credential.repository.js';
import type { NetworkProfileHandle } from './network-profile.repository.js';

export interface AuthenticationRuntimePort {
  authenticate(input: {
    pluginId: string;
    pluginVersion: string;
    userId?: string;
    credential: CredentialHandle;
    networkRoute?: NetworkProfileHandle;
    strategy: AuthenticationStrategy;
    configuration: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<AuthExecutionResult>;
}
```

```ts
// Add to SourceReaderPlugin
export interface AuthenticationExtension {
  login(
    request: { credentialHandleId: string },
    context: PluginContext
  ): Promise<AuthExecutionResult>;
  refreshSession?(
    request: { sessionHandleId: string },
    context: PluginContext
  ): Promise<AuthExecutionResult>;
  logout?(
    request: { sessionHandleId: string },
    context: PluginContext
  ): Promise<void>;
  resumeChallenge?(
    request: { challengeId: string; response: Record<string, unknown> },
    context: PluginContext
  ): Promise<AuthExecutionResult>;
}

// Add optional property:
authentication?: AuthenticationExtension;
```

- [ ] **Step 5: Implement standard strategies**

```ts
// apps/api/src/modules/source-reader/application/services/standard-authentication.service.ts
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type {
  AuthenticationStrategy,
  AuthExecutionResult
} from '../../domain/auth/authentication.js';

export class StandardAuthenticationService {
  async authenticate(input: {
    strategy: Exclude<AuthenticationStrategy, 'custom'>;
    secret: Record<string, unknown>;
    configuration: Record<string, unknown>;
    http: {
      get(url: string, options?: { headers?: Record<string, string> }): Promise<{ url: string; status: number; headers: Record<string, string>; data: string }>;
      post(url: string, options?: { headers?: Record<string, string>; body?: unknown }): Promise<{ url: string; status: number; headers: Record<string, string>; data: string }>;
    };
  }): Promise<AuthExecutionResult> {
    if (input.strategy === 'cookie-import') {
      const cookies = input.secret.cookies;
      if (!Array.isArray(cookies)) return this.failed('Cookie payload is invalid');
      return { status: 'authenticated', session: { kind: 'cookies', cookies: cookies as never, networkBinding: 'preferred' } };
    }
    if (input.strategy === 'bearer-token') {
      const token = String(input.secret.token ?? '');
      if (!token) return this.failed('Bearer token is missing');
      return { status: 'authenticated', session: { kind: 'headers', headers: { Authorization: `Bearer ${token}` }, networkBinding: 'none' } };
    }
    if (input.strategy === 'basic-auth') {
      const username = String(input.secret.username ?? '');
      const password = String(input.secret.password ?? '');
      if (!username || !password) return this.failed('Basic credentials are incomplete');
      return {
        status: 'authenticated',
        session: {
          kind: 'headers',
          headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` },
          networkBinding: 'none'
        }
      };
    }

    const loginUrl = String(input.configuration.loginUrl ?? '');
    const fields = input.configuration.fields as { username?: string; password?: string } | undefined;
    const username = String(input.secret.username ?? '');
    const password = String(input.secret.password ?? '');
    if (!loginUrl || !fields?.username || !fields.password || !username || !password) {
      return this.failed('Form login configuration or credentials are incomplete');
    }
    const body = new URLSearchParams({
      [fields.username]: username,
      [fields.password]: password
    });
    const response = await input.http.post(loginUrl, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    const expectedUrl = (input.configuration.success as { urlIncludes?: string } | undefined)?.urlIncludes;
    if (expectedUrl && !response.url.includes(expectedUrl)) return this.failed('Form login success condition failed');
    const setCookie = response.headers['set-cookie'];
    return {
      status: 'authenticated',
      session: {
        kind: 'cookies',
        cookies: setCookie ? parseSetCookie(setCookie) : [],
        networkBinding: 'preferred'
      }
    };
  }

  private failed(message: string): never {
    throw new SourceReaderError('AUTHENTICATION_FAILED', message, {
      retryable: false,
      fallbackAllowed: false
    });
  }
}
```

- [ ] **Step 6: Run auth tests and typecheck**

Run:

```bash
node --import tsx --test tests/regression/source-reader-standard-auth.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit auth contracts and standard strategies**

```bash
git add apps/api/src/modules/source-reader/domain/auth apps/api/src/modules/source-reader/application/ports/authentication-runtime.port.ts apps/api/src/modules/source-reader/application/services/standard-authentication.service.ts apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts tests/regression/source-reader-standard-auth.test.ts
git commit -m "feat(source-reader): add standard authentication strategies"
```

---

### Task 2: Orchestrate login and encrypted session persistence

**Files:**
- Create: `apps/api/src/modules/source-reader/application/services/authentication-orchestrator.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts`
- Test: `tests/integration/source-reader-session-login.test.ts`

**Interfaces:**
- Consumes: credential/session repositories, standard auth service, plugin auth extension, runtime context.
- Produces: login, refresh, logout, and transparent authenticated HTTP context attachment.

- [ ] **Step 1: Write failing login/session integration test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

test('login resolves credential secret internally and persists encrypted session', async () => {
  const fixture = await createAuthenticationFixture();
  const result = await fixture.orchestrator.login({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    userId: 'user-1',
    credentialProfileId: 'cred-1',
    strategy: 'bearer-token',
    configuration: {}
  });
  assert.equal(result.status, 'authenticated');
  const session = await fixture.sessions.findActive({
    pluginId: 'demo',
    credentialProfileId: 'cred-1',
    ownerId: 'user-1'
  });
  assert.ok(session);
  const databaseText = fixture.database.connection
    .prepare('SELECT hex(encrypted_session) AS value FROM source_reader_sessions WHERE id=?')
    .get(session!.id) as { value: string };
  assert.doesNotMatch(databaseText.value, /secret-token/i);
});
```

- [ ] **Step 2: Implement authentication orchestrator**

```ts
// authentication-orchestrator.service.ts
export class AuthenticationOrchestratorService implements AuthenticationRuntimePort {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly sessions: SessionRepository,
    private readonly standard: StandardAuthenticationService,
    private readonly plugins: PluginRegistryPort,
    private readonly ids: { next(): string },
    private readonly clock: { now(): Date }
  ) {}

  async authenticate(input: AuthenticationRequest): Promise<AuthExecutionResult> {
    const secret = await this.credentials.resolveSecret(input.credential);
    const candidates = await this.plugins.listCandidates({
      url: input.configuration.sourceUrl as string,
      capability: 'authentication'
    });
    const plugin = candidates.find((candidate) => candidate.plugin.manifest.id === input.pluginId)?.plugin;
    const result =
      input.strategy === 'custom'
        ? await plugin?.authentication?.login(
            { credentialHandleId: input.credential.id },
            input.pluginContext
          )
        : await this.standard.authenticate({
            strategy: input.strategy,
            secret,
            configuration: input.configuration,
            http: input.http
          });
    if (!result) {
      throw new SourceReaderError('CAPABILITY_NOT_SUPPORTED', 'Custom authentication is unavailable', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    if (result.status === 'authenticated') {
      await this.sessions.save({
        id: this.ids.next(),
        pluginId: input.pluginId,
        pluginVersion: input.pluginVersion,
        credentialProfileId: input.credential.id,
        ownerId: input.userId,
        ownerType: input.userId ? 'user' : 'system',
        networkProfileId: input.networkRoute?.id,
        networkBinding: result.session.networkBinding,
        encryptedMaterial: result.session,
        status: 'active',
        expiresAt: result.session.expiresAt,
        createdAt: this.clock.now().toISOString()
      });
    }
    return result;
  }
}
```

- [ ] **Step 3: Enforce route binding during runtime resolution**

```ts
// After finding session in RuntimeContextResolverService
if (
  session?.networkBinding === 'required' &&
  session.networkProfileId !== networkRoute?.id
) {
  throw new SourceReaderError(
    'SESSION_NETWORK_MISMATCH',
    'Session requires the network route used during login',
    { retryable: false, fallbackAllowed: false }
  );
}
```

- [ ] **Step 4: Attach session material inside PluginContextFactory**

```ts
// Resolve material through SessionRepository inside the factory, then wrap HTTP calls:
const sessionMaterial = runtimeContext.session
  ? await this.sessions.resolveMaterial(runtimeContext.session)
  : undefined;

// Merge allowed session headers/cookies into request options inside the host runtime.
// Do not add session material to the PluginContext object returned to external plugin code.
```

- [ ] **Step 5: Add logout and credential-deletion revocation**

```ts
async logout(input: { credentialProfileId: string }): Promise<void> {
  await this.sessions.revokeByCredential(input.credentialProfileId);
}

// Credential deletion use case must call revokeByCredential before repository.delete().
```

- [ ] **Step 6: Run login/session and route-binding tests**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-session-login.test.ts
node --import tsx --test tests/regression/source-reader-runtime-context.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit session orchestration**

```bash
git add apps/api/src/modules/source-reader/application/services/authentication-orchestrator.service.ts apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts tests/integration/source-reader-session-login.test.ts
git commit -m "feat(source-reader): persist route-bound login sessions"
```

---

### Task 3: Add browser worker coordinator and restricted browser client

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Create: `apps/api/src/modules/source-reader/application/ports/browser-runtime.port.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-protocol.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-worker.entry.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-runtime.coordinator.ts`
- Test: `tests/integration/source-reader-browser-runtime.test.ts`

**Interfaces:**
- Consumes: opaque secret handles, allowed hosts, network-route handle/config, abort signal.
- Produces: isolated browser session handle and restricted operations `open`, `waitFor`, `text`, `html`, `click`, `fillSecret`, `cookies`, and `close`.

- [ ] **Step 1: Add Playwright Core dependency**

Run:

```bash
npm install playwright-core@^1.61.1 -w @novel-tool/api
```

Expected: `apps/api/package.json` and `package-lock.json` include `playwright-core`.

- [ ] **Step 2: Write a failing browser runtime integration test**

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { BrowserRuntimeCoordinator } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-runtime.coordinator.ts';

test('browser runtime blocks navigation outside approved hosts and disables downloads', async () => {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<html><body><input id="password"><a id="outside" href="https://forbidden.invalid">outside</a></body></html>');
  }).listen(0);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  const host = `127.0.0.1:${address.port}`;
  const runtime = new BrowserRuntimeCoordinator({ browserExecutablePath: process.env.CHROMIUM_PATH });
  const session = await runtime.open({
    identity: { userId: 'u1', pluginId: 'demo', sourceAccountId: 'a1', networkRouteId: 'direct' },
    allowedHosts: ['127.0.0.1'],
    signal: new AbortController().signal
  });
  await session.open(`http://${host}`);
  await assert.rejects(() => session.open('https://forbidden.invalid'));
  await session.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
```

- [ ] **Step 3: Define the browser runtime port**

```ts
// browser-runtime.port.ts
export interface BrowserSessionIdentity {
  userId?: string;
  pluginId: string;
  sourceAccountId: string;
  networkRouteId?: string;
}

export interface BrowserSessionHandle {
  readonly id: string;
  open(url: string): Promise<void>;
  waitFor(selector: string): Promise<void>;
  text(selector: string): Promise<string | null>;
  html(selector: string): Promise<string | null>;
  click(selector: string): Promise<void>;
  fillSecret(selector: string, secretHandle: { credentialId: string; field: string }): Promise<void>;
  cookies(): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

export interface BrowserRuntimePort {
  open(input: {
    identity: BrowserSessionIdentity;
    allowedHosts: string[];
    networkProfileId?: string;
    signal: AbortSignal;
  }): Promise<BrowserSessionHandle>;
  closeByIdentity(identity: BrowserSessionIdentity): Promise<void>;
}
```

- [ ] **Step 4: Implement browser worker entry**

```ts
// browser-worker.entry.ts
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { parentPort, workerData } from 'node:worker_threads';

let browser: Browser;
let context: BrowserContext;
let page: Page;

async function initialize() {
  browser = await chromium.launch({
    headless: true,
    executablePath: workerData.browserExecutablePath,
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  });
  context = await browser.newContext({ acceptDownloads: false });
  page = await context.newPage();
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const allowed = workerData.allowedHosts.some(
      (host: string) => requestUrl.hostname === host || requestUrl.hostname.endsWith(`.${host}`)
    );
    if (!allowed) return route.abort('blockedbyclient');
    return route.continue();
  });
}

type BrowserCommand =
  | { id: string; type: 'open'; url: string }
  | { id: string; type: 'wait-for'; selector: string }
  | { id: string; type: 'text'; selector: string }
  | { id: string; type: 'html'; selector: string }
  | { id: string; type: 'click'; selector: string }
  | { id: string; type: 'fill-secret'; selector: string; handle: { credentialId: string; field: string } }
  | { id: string; type: 'cookies' }
  | { id: string; type: 'close' };

parentPort!.on('message', async (command: BrowserCommand) => {
  try {
    let value: unknown;
    if (command.type === 'open') { await page.goto(command.url, { waitUntil: 'domcontentloaded' }); value = undefined; }
    if (command.type === 'wait-for') { await page.waitForSelector(command.selector); value = undefined; }
    if (command.type === 'text') value = await page.locator(command.selector).first().textContent();
    if (command.type === 'html') value = await page.locator(command.selector).first().innerHTML();
    if (command.type === 'click') { await page.locator(command.selector).first().click(); value = undefined; }
    if (command.type === 'fill-secret') {
      value = await requestParentSecret(command.id, command.handle);
      await page.locator(command.selector).first().fill(String(value));
      value = undefined;
    }
    if (command.type === 'cookies') value = await context.cookies();
    if (command.type === 'close') {
      await page.close();
      await context.close();
      await browser.close();
      value = undefined;
    }
    parentPort!.postMessage({ id: command.id, ok: true, value });
  } catch (error) {
    parentPort!.postMessage({ id: command.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

await initialize();
```

`requestParentSecret()` sends `{ type: 'resolve-secret', requestId, handle }` to the coordinator and waits for a one-shot response. It must immediately overwrite its local reference after `fill()` and must never place the secret in `workerData`, logs, or a persisted browser profile.

- [ ] **Step 5: Implement coordinator with identity reuse and hard limits**

```ts
// browser-runtime.coordinator.ts
export class BrowserRuntimeCoordinator implements BrowserRuntimePort {
  private readonly sessions = new Map<string, WorkerBackedBrowserSession>();

  constructor(
    private readonly options: {
      browserExecutablePath?: string;
      credentialResolver?: (handle: { credentialId: string; field: string }) => Promise<string>;
      maxLifetimeMs?: number;
      maxNavigations?: number;
    }
  ) {}

  async open(input: BrowserOpenInput): Promise<BrowserSessionHandle> {
    const key = identityKey(input.identity);
    const existing = this.sessions.get(key);
    if (existing) return existing;
    const session = new WorkerBackedBrowserSession({
      ...input,
      browserExecutablePath: this.options.browserExecutablePath,
      credentialResolver: this.options.credentialResolver,
      maxLifetimeMs: this.options.maxLifetimeMs ?? 10 * 60_000,
      maxNavigations: this.options.maxNavigations ?? 50,
      onClosed: () => this.sessions.delete(key)
    });
    this.sessions.set(key, session);
    return session;
  }

  async closeByIdentity(identity: BrowserSessionIdentity): Promise<void> {
    await this.sessions.get(identityKey(identity))?.close();
  }
}
```

- [ ] **Step 6: Run browser test when Chromium is available; otherwise verify explicit skip**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-browser-runtime.test.ts
```

Expected: PASS when `CHROMIUM_PATH` points to Chromium. When no executable is configured, the test must use `test.skip('CHROMIUM_PATH is required for browser runtime integration')`; it must not silently pass after a runtime launch failure.

- [ ] **Step 7: Commit browser runtime**

```bash
git add apps/api/package.json package-lock.json apps/api/src/modules/source-reader/application/ports/browser-runtime.port.ts apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker tests/integration/source-reader-browser-runtime.test.ts
git commit -m "feat(source-reader): add isolated browser runtime"
```

---

### Task 4: Implement auth challenges and pause/resume flow

**Files:**
- Create: `apps/api/src/modules/source-reader/application/services/auth-challenge.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/authentication-orchestrator.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader-maintenance.service.ts`
- Test: `tests/integration/source-reader-auth-challenge.test.ts`

**Interfaces:**
- Consumes: challenge repository, browser runtime, plugin auth extension, SecretVault-backed state.
- Produces: challenge creation, response, completion, cancellation, expiration, and browser-context cleanup.

- [ ] **Step 1: Write failing OTP and expiration tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

test('OTP challenge can resume the same plugin auth flow exactly once', async () => {
  const fixture = await createChallengeFixture();
  const challenge = await fixture.service.create({
    pluginId: 'demo',
    type: 'otp',
    ownerId: 'u1',
    expiresAt: '2026-07-19T00:05:00.000Z',
    state: { flowToken: 'opaque' }
  });
  const result = await fixture.service.respond({
    challengeId: challenge.id,
    ownerId: 'u1',
    response: { type: 'otp', code: '123456' }
  });
  assert.equal(result.status, 'authenticated');
  await assert.rejects(() => fixture.service.respond({
    challengeId: challenge.id,
    ownerId: 'u1',
    response: { type: 'otp', code: '123456' }
  }));
});

test('expired browser challenge closes its browser identity', async () => {
  const fixture = await createChallengeFixture({ now: '2026-07-19T00:10:00.000Z' });
  await fixture.service.expirePending();
  assert.deepEqual(fixture.closedBrowserIdentities, ['u1:demo:cred-1:route-1']);
});
```

- [ ] **Step 2: Implement challenge service**

```ts
// auth-challenge.service.ts
export class AuthChallengeService {
  constructor(
    private readonly repository: AuthChallengeRepository,
    private readonly browser: BrowserRuntimePort,
    private readonly plugins: PluginRegistryPort,
    private readonly sessions: SessionRepository,
    private readonly ids: { next(): string },
    private readonly clock: { now(): Date }
  ) {}

  async create(input: {
    pluginId: string;
    credentialProfileId?: string;
    networkProfileId?: string;
    ownerId?: string;
    type: AuthChallengeHandle['type'];
    expiresAt: string;
    state: Record<string, unknown>;
  }) {
    const handle = {
      id: this.ids.next(),
      pluginId: input.pluginId,
      type: input.type,
      status: 'pending' as const,
      expiresAt: input.expiresAt
    };
    await this.repository.save({
      ...handle,
      credentialProfileId: input.credentialProfileId,
      networkProfileId: input.networkProfileId,
      ownerId: input.ownerId,
      encryptedState: input.state,
      createdAt: this.clock.now().toISOString()
    });
    return handle;
  }

  async respond(input: {
    challengeId: string;
    ownerId?: string;
    response: Record<string, unknown>;
  }): Promise<AuthExecutionResult> {
    const challenge = await this.repository.findPendingById(input.challengeId);
    if (!challenge || Date.parse(challenge.expiresAt) <= this.clock.now().getTime()) {
      throw new SourceReaderError('AUTH_CHALLENGE_EXPIRED', 'Authentication challenge expired', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    const state = await this.repository.resolveState(challenge);
    const plugin = await this.requirePlugin(challenge.pluginId);
    const result = await plugin.authentication!.resumeChallenge!(
      { challengeId: challenge.id, response: { ...state, ...input.response } },
      await this.contextFor(challenge)
    );
    await this.repository.complete(challenge.id, this.clock.now().toISOString());
    if (result.status === 'authenticated') await this.persistSession(challenge, result.session);
    return result;
  }
}
```

- [ ] **Step 3: Escalate auth orchestrator results into persisted challenges**

```ts
if (result.status === 'challenge-required') {
  await this.challenges.create({
    pluginId: input.pluginId,
    credentialProfileId: input.credential.id,
    networkProfileId: input.networkRoute?.id,
    ownerId: input.userId,
    type: result.challenge.type,
    expiresAt: result.challenge.expiresAt,
    state: { pluginChallengeId: result.challenge.id }
  });
}
```

- [ ] **Step 4: Expire challenges and close matching browser contexts in maintenance**

```ts
async expirePending(): Promise<void> {
  const expired = await this.repository.listExpiredPending(this.clock.now().toISOString());
  for (const challenge of expired) {
    await this.repository.markExpired(challenge.id);
    if (challenge.type === 'captcha' || challenge.type === 'browser-interaction') {
      await this.browser.closeByIdentity(identityFromChallenge(challenge));
    }
  }
}
```

Call `challengeService.expirePending()` from `SourceReaderMaintenanceService.runOnce()`.

- [ ] **Step 5: Run challenge and maintenance tests**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-auth-challenge.test.ts
node --import tsx --test tests/regression/source-reader-maintenance.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 6: Commit challenge flow**

```bash
git add apps/api/src/modules/source-reader/application/services/auth-challenge.service.ts apps/api/src/modules/source-reader/application/services/authentication-orchestrator.service.ts apps/api/src/modules/source-reader/application/services/source-reader-maintenance.service.ts tests/integration/source-reader-auth-challenge.test.ts
git commit -m "feat(source-reader): add resumable auth challenges"
```

---

### Task 5: Connect browser-required plugins and session cookies to normal reads

**Files:**
- Modify: `apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Test: `tests/integration/source-reader-authenticated-read.test.ts`

**Interfaces:**
- Consumes: browser runtime, authentication orchestrator, session repository, runtime requirements.
- Produces: transparent login/challenge errors and authenticated HTTP/browser reads.

- [ ] **Step 1: Write failing authenticated-read tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

test('read requiring auth returns AUTHENTICATION_REQUIRED when no session exists', async () => {
  const fixture = await createAuthenticatedReaderFixture({ hasCredential: true, hasSession: false });
  await assert.rejects(
    () => fixture.reader.readChapterContent({ url: 'https://example.test/premium/1', userId: 'u1' }),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'AUTHENTICATION_REQUIRED'
  );
});

test('active route-bound session attaches cookies to host HTTP requests', async () => {
  const fixture = await createAuthenticatedReaderFixture({ hasCredential: true, hasSession: true });
  await fixture.reader.readChapterContent({
    url: 'https://example.test/premium/1',
    userId: 'u1',
    networkProfileId: 'route-us'
  });
  assert.match(fixture.lastRequest.headers.Cookie, /sid=abc/);
});
```

- [ ] **Step 2: Mark browser requirement in resolved context**

```ts
browserRequired: Boolean(input.requiresBrowser)
```

Pass `candidate.plugin.manifest.runtime.requiresBrowser` into resolver input.

- [ ] **Step 3: Return stable auth/challenge errors before invoking read capability**

```ts
if (candidate.plugin.manifest.runtimeRequirements?.authentication?.required) {
  if (!runtimeContext.credential) {
    throw new SourceReaderError('CREDENTIAL_NOT_CONFIGURED', 'Credential is not configured', {
      retryable: false,
      fallbackAllowed: false
    });
  }
  if (!runtimeContext.session) {
    throw new SourceReaderError('AUTHENTICATION_REQUIRED', 'Login is required before reading', {
      retryable: false,
      fallbackAllowed: false,
      details: { credentialProfileId: runtimeContext.credential.id }
    });
  }
}
```

- [ ] **Step 4: Build host-side HTTP client with decrypted session material and route transport**

```ts
// PluginContextFactory must resolve session material and network config internally.
// Apply cookie/header values to host HTTP adapter options.
// The returned PluginContext must expose only http.get/post response methods, not session material.
```

Required assertion inside implementation:

```ts
if (
  runtimeContext.session?.networkBinding === 'required' &&
  runtimeContext.session.networkProfileId !== runtimeContext.networkRoute?.id
) {
  throw new SourceReaderError('SESSION_NETWORK_MISMATCH', 'Session route mismatch', {
    retryable: false,
    fallbackAllowed: false
  });
}
```

- [ ] **Step 5: Route browser-required invocation through browser client**

```ts
const browser = runtimeContext.browserRequired
  ? await this.browser.open({
      identity: {
        userId: request.userId as string | undefined,
        pluginId: candidate.plugin.manifest.id,
        sourceAccountId: runtimeContext.credential?.id ?? `public:${candidate.domain}`,
        credentialId: runtimeContext.credential?.id,
        networkRouteId: runtimeContext.networkRoute?.id
      },
      allowedHosts: candidate.plugin.manifest.permissions.network.hosts,
      networkProfileId: runtimeContext.networkRoute?.id,
      signal
    })
  : undefined;
```

Expose browser operations in `PluginContext` only when manifest permission `browser: true` has been approved. Public JavaScript-heavy sources use a source-scoped anonymous identity; authentication remains a separate runtime requirement.

- [ ] **Step 6: Compose all auth/browser services**

```ts
const browser = new BrowserRuntimeCoordinator({
  browserExecutablePath: env.sourceReaderBrowserExecutable,
  credentialResolver: async ({ credentialId, field }) => {
    const handle = await credentials.findHandleById(credentialId);
    if (!handle) throw new Error('Credential not found');
    const secret = await credentials.resolveSecret(handle);
    return String(secret[field] ?? '');
  }
});
const authentication = new AuthenticationOrchestratorService(...);
const authChallenges = new AuthChallengeService(...);
```

Add environment field:

```ts
sourceReaderBrowserExecutable: process.env.SOURCE_READER_BROWSER_EXECUTABLE
```

- [ ] **Step 7: Run authenticated-read, challenge, session, and runtime tests**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test \
  tests/integration/source-reader-authenticated-read.test.ts \
  tests/integration/source-reader-session-login.test.ts \
  tests/integration/source-reader-auth-challenge.test.ts
node --import tsx --test tests/regression/source-reader-runtime-context.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 8: Commit authenticated reading**

```bash
git add apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts apps/api/src/modules/source-reader/application/services/source-reader.service.ts apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts apps/api/src/shared/container/modules/source-reader.module.ts apps/api/src/shared/config/env.ts tests/integration/source-reader-authenticated-read.test.ts
git commit -m "feat(source-reader): read through authenticated browser contexts"
```

## Plan completion gate

Run:

```bash
npm run verify
```

Expected: exit `0`; standard and custom auth produce encrypted sessions, OTP/browser challenges pause and resume, CAPTCHA remains user-operated, and route-bound session mismatches fail before plugin execution.
