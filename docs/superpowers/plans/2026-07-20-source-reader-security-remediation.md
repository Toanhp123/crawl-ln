# Source Reader Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the security and architecture gaps identified after the original 33-task Source Reader roadmap by replacing worker-thread external execution, applying network routes to real traffic, isolating cache/session identities, and completing lifecycle, compatibility, authentication, validation, logging, migration, and acceptance behavior.

**Architecture:** Built-in plugins remain in-process. Every external plugin version runs in a supervised Node.js 22+ child process and its code executes inside an SES `Compartment` with no ambient authority; Node permissions and a deny-by-default loader are outer defense-in-depth controls. All HTTP, browser, secret, cache, clock, lifecycle, and logging authority remains in the host and is exposed only through schema-validated RPC messages.

**Tech Stack:** TypeScript ESM, Node.js 22.12+, SES/HardenedJS, child processes, Zod, Ajv, semver, Axios, proxy-agent, Playwright Core, SQLite, Node test runner, Prettier.

## Global Constraints

- Production and development runtimes remain `node >=22.12.0` and `npm >=10.0.0`.
- External plugins are JavaScript/ESM only; reject native `.node` addons, executable binaries, packaged subprocesses, and symlinks escaping the verified package root.
- Node's permission model is defense in depth, not the sole hostile-code boundary. External plugin source must execute inside an SES `Compartment` with an explicit module map and hardened endowments.
- External plugins have no direct filesystem, process, worker, raw socket, HTTP, HTTPS, fetch, environment, stdout, or stderr authority.
- Network profiles normalize to `direct`, `http-proxy`, `https-proxy`, or `socks-proxy`, and the selected route applies to both host HTTP and Chromium.
- Required non-direct routes fail closed; no code path may retry using direct transport.
- Cache scope identities are distinct: public constant, account credential ID, user actor ID, session record ID.
- Stale-while-revalidate is allowed only for public cache entries.
- Session lookup binds plugin ID, plugin version, credential ID, owner ID, and route identity.
- Plugin activation is atomic: compatibility, permission approval, sandbox startup, `initialize`, and `healthCheck` precede active registry publication.
- Required extension failures block activation/invocation; optional extension failures omit only that extension and produce bounded warnings.
- External custom authentication and `canHandle` use dedicated RPC operations and purpose-specific DTOs.
- All logs pass through one bounded structured redaction boundary.
- Existing external plugins migrate fail-closed and cannot use a legacy worker runtime.
- Complete exactly three implementation tasks per execution batch. After Task 3, 6, 9, and 12, stop implementation, verify the batch, commit checkpoint metadata, create a recoverable ZIP with `.git`, create SHA-256, and test restoration before continuing.

## Security Reference Note

Node.js 22 permission flags restrict filesystem, subprocess, worker, addon, WASI, and inspector access, but Node's own documentation explicitly does not treat that mechanism as a malicious-code security sandbox. Therefore this plan uses SES compartments as the language-level authority boundary and treats process permissions plus the loader as defense in depth.

## File and Boundary Map

- `application/ports/external-plugin-supervisor.port.ts`: application-facing lifecycle and RPC contract for external versions.
- `application/ports/network-route.port.ts`: normalized route and route resolver contracts.
- `application/ports/source-reader-invalidation.port.ts`: typed invalidation events.
- `application/services/plugin-activation.service.ts`: atomic candidate activation and rollback ordering.
- `application/services/plugin-compatibility.service.ts`: runtime, contract, permission, and extension compatibility decisions.
- `application/services/source-reader-invalidation.service.ts`: session/browser/cache invalidation coordinator.
- `application/services/source-reader-structured-logger.ts`: single redacting logging boundary.
- `infrastructure/runtime/external-process/*`: child-process supervisor, RPC framing, SES bootstrap, module graph, and policy enforcement.
- `infrastructure/network/*`: proxy route resolution, transport agent factory, live route tests.
- `infrastructure/cache/*`: canonical cache identity, persistent metadata, tag index, stale refresh behavior.
- `infrastructure/sqlite/*`: session version filtering, cache metadata/tag persistence, activation/migration state.
- `shared/container/modules/source-reader.module.ts`: composition only; no remediation behavior should be implemented directly in this file.

---

### Task 1: Replace Worker-Thread External Execution with a Supervised SES Process Sandbox

**Files:**

- Create: `apps/api/src/modules/source-reader/application/ports/external-plugin-supervisor.port.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.schema.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-bootstrap.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-module-loader.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-entry.mjs`
- Create: `tests/fixtures/source-reader/external-plugins/hostile/dist/index.js`
- Create: `tests/fixtures/source-reader/external-plugins/pure-compute/dist/index.js`
- Create: `tests/regression/source-reader-external-process-sandbox.test.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/plugin-runtime.port.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/runtime-router.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Modify: `apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: `RegisteredPlugin`, `PluginOperationResult`, `SourceCapability`, verified `packagePath` and manifest from `PluginStorePort`.
- Produces:

```ts
export type ExternalPluginOperation =
  | 'initialize'
  | 'healthCheck'
  | 'shutdown'
  | 'probeCanHandle'
  | 'login'
  | 'resumeChallenge'
  | 'invokeCapability';

export interface ExternalPluginRequest {
  requestId: string;
  operation: ExternalPluginOperation;
  deadlineAt: string;
  payload: Record<string, unknown>;
}

export interface ExternalPluginProcessHandle {
  pluginId: string;
  pluginVersion: string;
  request(request: ExternalPluginRequest, signal: AbortSignal): Promise<unknown>;
  terminate(reason: string): Promise<void>;
}

export interface ExternalPluginSupervisorPort {
  start(input: {
    pluginId: string;
    pluginVersion: string;
    packageRoot: string;
    entryPath: string;
  }): Promise<ExternalPluginProcessHandle>;
  get(pluginId: string, pluginVersion: string): ExternalPluginProcessHandle | undefined;
  stop(pluginId: string, pluginVersion: string, reason: string): Promise<void>;
}
```

- [ ] **Step 1: Install the sandbox dependencies**

Run:

```bash
npm install ses @endo/compartment-mapper -w @novel-tool/api
```

Expected: `apps/api/package.json` and `package-lock.json` contain the two dependencies and `npm run check:lockfile` exits 0.

- [ ] **Step 2: Write hostile behavioral fixtures and failing tests**

Create a hostile fixture whose exported `invokeCapability()` attempts all of these operations and reports whether each succeeded:

```js
export async function invokeCapability() {
  const results = {};
  for (const [name, load] of [
    ['fs', () => import('node:fs')],
    ['childProcess', () => import('node:child_process')],
    ['net', () => import('node:net')],
    ['workerThreads', () => import('node:worker_threads')]
  ]) {
    try {
      await load();
      results[name] = 'ALLOWED';
    } catch (error) {
      results[name] = error?.code ?? error?.name ?? 'BLOCKED';
    }
  }
  results.env = globalThis.process?.env?.SOURCE_READER_MASTER_KEY ?? 'BLOCKED';
  results.fetch = typeof globalThis.fetch;
  return { data: results };
}
```

The regression test must also create an escaping symlink and a `.node` file under a temporary package and assert startup fails with `PLUGIN_SANDBOX_POLICY_VIOLATION`. It must assert pure arithmetic and a declared `clockNow` host RPC still succeed. Add one never-resolving invocation and one aborted invocation; assert the supervisor sends cancellation, waits a fixed 100 ms grace period, terminates the process, and returns `SOURCE_REQUEST_TIMEOUT` or `SOURCE_READER_CANCELLED` without leaving a live handle.

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
node --import tsx --test tests/regression/source-reader-external-process-sandbox.test.ts
```

Expected: FAIL because `ExternalProcessSupervisor`, sandbox protocol, and SES bootstrap do not exist; the existing worker runtime must demonstrably allow at least filesystem or subprocess access if the test temporarily points at it.

- [ ] **Step 4: Implement schema-validated child-process IPC RPC**

Define the host-to-sandbox and sandbox-to-host envelopes with Zod. Every envelope must contain `protocolVersion: 1`, `requestId`, `type`, and a bounded payload. Reject unknown operation names and additional privileged fields with `PLUGIN_RPC_PROTOCOL_INVALID`.

Use a dedicated IPC channel created with `fork(..., { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })`; do not treat stdout as protocol transport.

- [ ] **Step 5: Add stable sandbox error codes**

Add these codes to API and shared contracts:

```ts
| 'EXTERNAL_RUNTIME_UNSUPPORTED'
| 'PLUGIN_SANDBOX_START_FAILED'
| 'PLUGIN_SANDBOX_POLICY_VIOLATION'
| 'PLUGIN_RPC_PROTOCOL_INVALID'
```

Supervisor errors must include safe plugin ID/version and operation only; never include host paths or raw plugin output.

- [ ] **Step 6: Implement the SES bootstrap and module map**

The bootstrap must run before any plugin code:

```ts
import 'ses';
lockdown({ errorTaming: 'safe', stackFiltering: 'concise', consoleTaming: 'safe' });

const compartment = new Compartment({
  globals: harden({}),
  modules: verifiedModuleMap,
  __options__: true
});
harden(compartment.globalThis);
```

`verifiedModuleMap` may contain only package-root JavaScript/JSON modules and the frozen Source Reader SDK facade. Reject built-in specifiers, absolute paths, root escapes, native files, executable files, and unresolved package dependencies.

- [ ] **Step 7: Spawn the process with restrictive Node flags**

Use `process.execPath` with:

```ts
const args = [
  '--permission',
  '--max-old-space-size=128',
  `--allow-fs-read=${sandboxEntry}`,
  `--allow-fs-read=${packageRoot}`,
  '--disable-proto=throw',
  sandboxEntry
];
```

Do not pass `--allow-child-process`, `--allow-worker`, `--allow-addons`, or `--allow-wasi`. Pass an environment containing only `PATH`, locale fields needed by Node, and trusted protocol configuration. Clear application secrets. Require a startup `hello` frame with protocol version 1 within the configured startup timeout. Enforce CPU/runaway behavior with per-operation deadlines, cancellation, the 100 ms grace period, and forced process termination.

- [ ] **Step 8: Route external capability invocation through the supervisor**

Change `RuntimeRouter` so built-ins still use `InProcessPluginRuntime`, while every external registration resolves a long-lived process handle keyed by `pluginId@version` and sends `invokeCapability`. Delete no legacy files yet; architecture removal is Task 11.

- [ ] **Step 9: Run focused verification**

Run:

```bash
npm run check:lockfile
npm run build:shared
npm run check -w @novel-tool/api
node --import tsx --test tests/regression/source-reader-external-process-sandbox.test.ts tests/regression/source-reader-isolated-worker.test.ts
```

Expected: all pass; hostile fixture reports blocked authority, pure computation succeeds, and no test uses worker threads as the external security boundary.

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/src/modules/source-reader/application/ports/external-plugin-supervisor.port.ts apps/api/src/modules/source-reader/application/ports/plugin-runtime.port.ts apps/api/src/modules/source-reader/infrastructure/runtime/external-process apps/api/src/modules/source-reader/infrastructure/runtime/runtime-router.ts apps/api/src/shared/container/modules/source-reader.module.ts apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts packages/shared/src/index.ts tests/fixtures/source-reader/external-plugins tests/regression/source-reader-external-process-sandbox.test.ts tests/regression/source-reader-isolated-worker.test.ts
git commit -m "feat(source-reader): sandbox external plugins in supervised processes"
```

---

### Task 2: Apply Resolved HTTP, HTTPS, and SOCKS Routes to HTTP and Chromium Traffic

**Files:**

- Create: `apps/api/src/modules/source-reader/application/ports/network-route.port.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/network/network-route.resolver.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/network/proxy-agent.factory.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/network/route-aware-http-client.adapter.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/network/network-route-tester.ts`
- Create: `tests/helpers/http-proxy-server.ts`
- Create: `tests/helpers/socks5-proxy-server.ts`
- Create: `tests/integration/source-reader-network-routing.test.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/runtime-context-resolver.port.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/network-profile.repository.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-network-profile.repository.ts`
- Modify: `apps/api/src/modules/source-reader/presentation/dto/source-reader.dto.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/browser-runtime.port.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-runtime.coordinator.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-worker.entry.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Modify: `apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: `NetworkProfileRepository.resolveConfig()`, `SecretVaultPort`, `HttpClientPort`, `BrowserRuntimePort`.
- Produces:

```ts
export type ResolvedNetworkRoute =
  | { kind: 'direct'; identity: 'direct' }
  | {
      kind: 'http-proxy' | 'https-proxy' | 'socks-proxy';
      identity: string;
      endpoint: string;
      username?: string;
      password?: string;
    };

export interface NetworkRouteResolverPort {
  resolve(handle?: NetworkProfileHandle): Promise<ResolvedNetworkRoute>;
}

export interface RoutedHttpRequestOptions {
  route: ResolvedNetworkRoute;
  headers?: Record<string, string>;
  timeoutMs?: number;
}
```

- [ ] **Step 1: Install route-agent support**

Run:

```bash
npm install proxy-agent -w @novel-tool/api
```

Expected: lockfile portability passes.

- [ ] **Step 2: Write failing HTTP and browser route tests**

The integration test must start:

1. a destination server that records remote requests;
2. an HTTP CONNECT/forward proxy that adds `x-test-proxy: http`;
3. a minimal SOCKS5 proxy that records the CONNECT destination;
4. an unavailable proxy port.

Assert that routed HTTP reaches the destination through the proxy, required-route failure never reaches the destination directly, proxy credentials never appear in captured logs, Chromium is launched with the selected proxy, and changing route identity creates a new browser identity.

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-network-routing.test.ts
```

Expected: FAIL because selected profiles currently affect only identity selection and not transport.

- [ ] **Step 4: Add stable routing error codes**

Add these codes to API and shared contracts:

```ts
| 'NETWORK_ROUTE_UNAVAILABLE'
| 'NETWORK_ROUTE_UNSUPPORTED'
| 'NETWORK_ROUTE_TEST_FAILED'
```

- [ ] **Step 5: Implement normalized route resolution**

Update the profile union and public DTOs to accept `direct`, `http-proxy`, `https-proxy`, and `socks-proxy`. Existing persisted `vpn-gateway` rows are read only as unsupported legacy values and must throw `NETWORK_ROUTE_UNSUPPORTED`; new create/update requests cannot write them. Map encrypted configuration to `ResolvedNetworkRoute`, validate endpoints with URL parsing, require host/port, support only `http:`, `https:`, and `socks5:` schemes, and never return direct fallback for an invalid selected profile.

- [ ] **Step 6: Implement route-aware HTTP transport**

`RouteAwareHttpClientAdapter` must select a cached bounded `ProxyAgent` by route identity, pass it as Axios `httpAgent` and `httpsAgent`, set `proxy: false`, and preserve current response size and timeout behavior. The `PluginContextFactory` must receive the resolved route per invocation rather than a singleton unrestricted HTTP client.

- [ ] **Step 7: Apply route to Chromium**

Extend `BrowserSessionIdentity` with `pluginVersion`, `credentialId`, `sessionId`, and `networkIdentity`. Pass proxy configuration in worker data and launch Chromium with:

```ts
proxy: route.kind === 'direct'
  ? undefined
  : {
      server: route.endpoint,
      ...(route.username ? { username: route.username } : {}),
      ...(route.password ? { password: route.password } : {})
    };
```

Do not log the proxy password or credential-bearing endpoint.

- [ ] **Step 8: Replace the placeholder route test endpoint**

`NetworkRouteTester.test()` must make one bounded request through the selected route to the configured diagnostic URL, measure duration with `ClockPort`, persist health, and return typed errors. It must not return stored health with `latencyMs: 0`.

- [ ] **Step 9: Run focused verification**

```bash
npm run check:lockfile
npm run check -w @novel-tool/api
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-network-routing.test.ts tests/integration/source-reader-browser-runtime.test.ts tests/integration/source-reader-authenticated-read.test.ts
```

Expected: all pass and unavailable required routes produce zero direct destination requests.

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/src/modules/source-reader/application/ports/network-route.port.ts apps/api/src/modules/source-reader/application/ports/runtime-context-resolver.port.ts apps/api/src/modules/source-reader/application/ports/network-profile.repository.ts apps/api/src/modules/source-reader/application/ports/browser-runtime.port.ts apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-network-profile.repository.ts apps/api/src/modules/source-reader/presentation/dto/source-reader.dto.ts packages/shared/src/index.ts apps/api/src/modules/source-reader/infrastructure/network apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker apps/api/src/shared/container/modules/source-reader.module.ts apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts packages/shared/src/index.ts tests/helpers/http-proxy-server.ts tests/helpers/socks5-proxy-server.ts tests/integration/source-reader-network-routing.test.ts tests/integration/source-reader-browser-runtime.test.ts tests/integration/source-reader-authenticated-read.test.ts
git commit -m "feat(source-reader): route HTTP and browser traffic through profiles"
```

---

### Task 3: Separate Cache Scope Identity and Bind Sessions to Plugin Version and Route

**Files:**

- Create: `apps/api/src/modules/source-reader/application/services/source-reader-cache-key.ts`
- Create: `tests/integration/source-reader-cache-scope-identity.test.ts`
- Create: `tests/integration/source-reader-session-binding.test.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/runtime-context-resolver.port.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/session.repository.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-runtime.coordinator.ts`
- Modify: `apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `docs/superpowers/checkpoints/2026-07-20-source-reader-remediation.md`

**Interfaces:**

- Consumes: resolved actor ID, credential handle, session handle, route identity, capability contract, extension contracts.
- Produces:

```ts
export interface ResolvedCacheIdentity {
  public: 'public';
  account?: string;
  user?: string;
  session?: string;
  network: string;
}

export interface SourceReaderCacheIdentity {
  pluginId: string;
  pluginVersion: string;
  capability: SourceCapability;
  contractVersion: string;
  extensionContractVersions: Record<string, string>;
  normalizedRequestFingerprint: string;
  networkIdentity: string;
  scope: 'public' | 'account' | 'user' | 'session';
  scopeIdentity: string;
}
```

- [ ] **Step 1: Write failing cache and session tests**

The tests must prove:

- public cache is shared;
- account cache differs by credential ID;
- user cache differs by actor ID even with one system credential;
- session cache differs by session record ID;
- plugin version, capability contract, extension contracts, request fingerprint, and route identity alter the key;
- `findActive` rejects an otherwise matching session from an older plugin version;
- a route-bound session cannot be reused on direct or another proxy identity.

- [ ] **Step 2: Run the tests and verify RED**

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-cache-scope-identity.test.ts tests/integration/source-reader-session-binding.test.ts
```

Expected: FAIL because runtime context exposes one `authScope` and session lookup omits `pluginVersion`.

- [ ] **Step 3: Add stable identity error codes**

Add these codes to API and shared contracts:

```ts
| 'SESSION_BINDING_MISMATCH'
| 'CACHE_SCOPE_IDENTITY_MISSING'
```

- [ ] **Step 4: Implement canonical cache key generation**

Use stable key ordering and SHA-256:

```ts
export function buildSourceReaderCacheKey(identity: SourceReaderCacheIdentity): string {
  const extensions = Object.entries(identity.extensionContractVersions).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return createHash('sha256')
    .update(JSON.stringify({ ...identity, extensionContractVersions: extensions }))
    .digest('hex');
}
```

Throw `CACHE_SCOPE_IDENTITY_MISSING` when account, user, or session scope is requested without its corresponding identity.

- [ ] **Step 5: Return distinct identities from runtime resolution**

Replace `cacheIdentity.authScope` with:

```ts
cacheIdentity: {
  public: 'public',
  ...(credential ? { account: credential.id } : {}),
  ...(input.userId ? { user: input.userId } : {}),
  ...(session ? { session: session.id } : {}),
  network: resolvedRoute.identity
}
```

- [ ] **Step 6: Bind session repository lookup completely**

Change `SessionRepository.findActive()` and SQL to require `pluginVersion` and route identity/profile. Remove `findActiveAnyRoute`; route mismatch must produce `SESSION_BINDING_MISMATCH`, not select an alternate session.

- [ ] **Step 7: Include the complete identity in browser pooling**

Browser pool keys must include plugin version, credential, session, owner, and normalized route identity. Update all callers and tests.

- [ ] **Step 8: Run focused verification**

```bash
npm run check -w @novel-tool/api
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-cache-scope-identity.test.ts tests/integration/source-reader-session-binding.test.ts tests/integration/source-reader-cache-isolation.test.ts tests/integration/source-reader-session-login.test.ts tests/regression/source-reader-runtime-context.test.ts tests/regression/source-reader-service.test.ts
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/source-reader/application/ports/runtime-context-resolver.port.ts apps/api/src/modules/source-reader/application/ports/session.repository.ts apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts apps/api/src/modules/source-reader/application/services/source-reader-cache-key.ts apps/api/src/modules/source-reader/application/services/source-reader.service.ts apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-runtime.coordinator.ts apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts packages/shared/src/index.ts tests/integration/source-reader-cache-scope-identity.test.ts tests/integration/source-reader-session-binding.test.ts tests/integration/source-reader-cache-isolation.test.ts tests/integration/source-reader-session-login.test.ts tests/regression/source-reader-runtime-context.test.ts tests/regression/source-reader-service.test.ts
git commit -m "fix(source-reader): isolate cache scopes and session bindings"
```

#### Mandatory Checkpoint after Task 3

Run the batch gate:

```bash
npm run check
node --import tsx --test tests/regression/source-reader-external-process-sandbox.test.ts tests/regression/source-reader-runtime-context.test.ts tests/regression/source-reader-service.test.ts
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-network-routing.test.ts tests/integration/source-reader-cache-scope-identity.test.ts tests/integration/source-reader-session-binding.test.ts
```

Record completed tasks and next task in `docs/superpowers/checkpoints/2026-07-20-source-reader-remediation.md`, commit it, then package and verify:

```bash
repo=$(git rev-parse --show-toplevel)
out=/mnt/data/novel-tool-v2.9.6-source-reader-remediation-batch1-2026-07-20.zip
(cd "$(dirname "$repo")" && zip -qr "$out" "$(basename "$repo")" -x '*/node_modules/*' '*/dist/*' '*/coverage/*' '*/.cache/*' '*/data/*.db*')
sha256sum "$out" > "$out.sha256"
unzip -t "$out"
tmp=$(mktemp -d)
unzip -q "$out" -d "$tmp"
git -C "$tmp/$(basename "$repo")" fsck --full
git -C "$tmp/$(basename "$repo")" status --short
rm -rf "$tmp"
```

Stop implementation immediately after the ZIP and checksum are verified.

---

### Task 4: Add Plugin Lifecycle and Atomic Candidate Activation

**Files:**

- Create: `apps/api/src/modules/source-reader/application/services/plugin-activation.service.ts`
- Create: `apps/api/src/modules/source-reader/domain/plugin/plugin-lifecycle.ts`
- Create: `tests/integration/source-plugin-lifecycle-activation.test.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/external-plugin-supervisor.port.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/plugin-registry.port.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts`
- Modify: `apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts`
- Modify: `apps/api/src/modules/source-reader/application/use-cases/plugins/manage-source-plugins.usecase.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Modify: `apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**

- Consumes: `ExternalPluginSupervisorPort`, `PluginStorePort`, `PluginRegistryPort`, `PluginCompatibilityService`, approved permissions, and `ClockPort`.
- Produces:

```ts
export interface PluginLifecycleContext {
  pluginId: string;
  pluginVersion: string;
  protocolVersion: number;
  now: string;
}

export interface PluginLifecycle {
  initialize(context: PluginLifecycleContext): Promise<void>;
  healthCheck(): Promise<{
    status: 'healthy' | 'degraded';
    details?: Record<string, string>;
  }>;
  shutdown(reason: 'upgrade' | 'disable' | 'quarantine' | 'application-stop'): Promise<void>;
}

export interface PluginActivationResult {
  pluginId: string;
  version: string;
  status: 'active' | 'installed' | 'quarantined';
  warnings: Array<{ code: string; message: string }>;
}
```

- [ ] **Step 1: Write lifecycle ordering tests**

Create spies that append these exact events:

```ts
const events: string[] = [];
const candidate = {
  initialize: async () => void events.push('candidate.initialize'),
  healthCheck: async () => {
    events.push('candidate.health');
    return { status: 'healthy' as const };
  },
  shutdown: async () => void events.push('candidate.shutdown')
};
```

Assert successful activation orders events as:

```ts
['candidate.initialize', 'candidate.health', 'store.publish', 'registry.publish', 'old.shutdown'];
```

Add separate tests for initialize failure, health failure, registry resolution failure, and old-version shutdown failure. In all pre-publication failures, the previous version must remain active.

- [ ] **Step 2: Run the test and verify RED**

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-plugin-lifecycle-activation.test.ts
```

Expected: FAIL because `EnablePluginUseCase` currently calls `pluginStore.activate()` directly and no lifecycle service exists.

- [ ] **Step 3: Add lifecycle methods to built-in and external registrations**

Add optional lifecycle to `SourceReaderPlugin` and normalize it at registration time:

```ts
const noOpLifecycle: PluginLifecycle = {
  async initialize() {},
  async healthCheck() {
    return { status: 'healthy' };
  },
  async shutdown() {}
};
```

External registrations must implement lifecycle by forwarding the dedicated RPC operations to their process handle.

- [ ] **Step 4: Add atomic registry snapshots**

Extend the port with:

```ts
export interface PreparedPluginRegistrySnapshot {
  registrations: ReadonlyMap<string, RegisteredPlugin>;
}

export interface PluginRegistryPort {
  snapshot(): ReadonlyMap<string, RegisteredPlugin>;
  prepareRegistration(
    snapshot: ReadonlyMap<string, RegisteredPlugin>,
    registration: RegisteredPlugin
  ): PreparedPluginRegistrySnapshot;
  publishPrepared(snapshot: PreparedPluginRegistrySnapshot): void;
}
```

`prepareRegistration()` performs every duplicate/contract/resolution check and may throw before persistence changes. `publishPrepared()` is a no-throw synchronous assignment. Never mutate the live map during candidate preparation.

- [ ] **Step 5: Add the lifecycle error code**

Add `PLUGIN_LIFECYCLE_FAILED` to API/shared error unions and map safe lifecycle phases (`initialize`, `healthCheck`, `shutdown`) into error details.

- [ ] **Step 6: Implement `PluginActivationService.activate()`**

Use this control flow:

```ts
const previous = await store.findActive(input.pluginId);
const handle = await supervisor.start(candidateProcessInput);
try {
  await handle.request(initializeRequest, input.signal);
  const health = await handle.request(healthRequest, input.signal);
  assertHealthy(health);
  const nextSnapshot = registry.prepareRegistration(registry.snapshot(), candidateRegistration);
  await store.activateCandidateAtomically(input.pluginId, input.version, input.activatedAt);
  registry.publishPrepared(nextSnapshot);
} catch (error) {
  await handle.terminate('activation-failed');
  await store.recordActivationFailure(classifyActivationFailure(error));
  throw error;
}
await shutdownPrevious(previous);
```

Compatibility validation, permission approval, process handshake, initialize, health, and prepared-snapshot validation all happen before `activateCandidateAtomically()`. Because `publishPrepared()` is deliberately no-throw, the database switch and in-memory publication form one ordered commit boundary without a fallible operation between them. Task 5 supplies the full compatibility report implementation.

- [ ] **Step 7: Change enable, disable, quarantine, and application stop flows**

`EnablePluginUseCase` returns `PluginActivationResult`. Disable/quarantine publish a snapshot without the plugin before lifecycle shutdown. Application shutdown calls external lifecycle `shutdown('application-stop')`, then force-terminates remaining processes.

- [ ] **Step 8: Run focused verification**

```bash
npm run check -w @novel-tool/api
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-plugin-lifecycle-activation.test.ts tests/integration/source-plugin-activation.test.ts tests/integration/source-plugin-health.test.ts
```

Expected: all pass and event assertions prove publication ordering.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/source-reader/domain/plugin/plugin-lifecycle.ts apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts apps/api/src/modules/source-reader/application/services/plugin-activation.service.ts apps/api/src/modules/source-reader/application/ports/external-plugin-supervisor.port.ts apps/api/src/modules/source-reader/application/ports/plugin-registry.port.ts apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts apps/api/src/modules/source-reader/application/use-cases/plugins/manage-source-plugins.usecase.ts apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts apps/api/src/shared/container/modules/source-reader.module.ts apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts packages/shared/src/index.ts tests/integration/source-plugin-lifecycle-activation.test.ts tests/integration/source-plugin-activation.test.ts tests/integration/source-plugin-health.test.ts
git commit -m "feat(source-reader): activate plugins through lifecycle gates"
```

---

### Task 5: Enforce Runtime, Capability, Extension, and Package Compatibility

**Files:**

- Create: `apps/api/src/modules/source-reader/application/services/plugin-compatibility.service.ts`
- Create: `apps/api/src/modules/source-reader/domain/plugin/source-reader-host-compatibility.ts`
- Create: `tests/regression/source-plugin-compatibility.test.ts`
- Modify: `apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/plugin-installation.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/plugin-activation.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts`
- Modify: `apps/api/src/shared/database/sqlite.ts`
- Modify: `apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: parsed manifest, verified package graph, host runtime declarations.
- Produces:

```ts
export interface CompatibilityIssue {
  code: string;
  path: string;
  severity: 'warning' | 'fatal';
  message: string;
}

export interface CompatibilityReport {
  compatible: boolean;
  issues: CompatibilityIssue[];
  activatedExtensions: Record<string, { version: number; schema: string; required: boolean }>;
}

export const SOURCE_READER_HOST_COMPATIBILITY = {
  runtimeVersion: '2.9.6',
  sandboxProtocolVersion: 1,
  capabilityContracts: {
    identify: [1],
    metadata: [1],
    'chapter-list': [1],
    'chapter-content': [1],
    search: [1],
    'latest-updates': [1],
    authentication: [1]
  },
  permissions: ['network', 'browser', 'authentication', 'persistentCache', 'externalAssets']
} as const;
```

- [ ] **Step 1: Install compatibility dependencies**

```bash
npm install semver ajv -w @novel-tool/api
npm install -D @types/semver -w @novel-tool/api
```

Expected: `npm run check:lockfile` exits 0.

- [ ] **Step 2: Write failing compatibility and package-policy tests**

Use table-driven cases:

```ts
const fatalCases = [
  ['invalid range', { engines: { sourceReader: 'not-a-range' } }, 'PLUGIN_RUNTIME_INCOMPATIBLE'],
  ['future runtime', { engines: { sourceReader: '>=99.0.0' } }, 'PLUGIN_RUNTIME_INCOMPATIBLE'],
  ['unknown contract', { contracts: { metadata: 99 } }, 'PLUGIN_CAPABILITY_CONTRACT_UNSUPPORTED'],
  ['unknown permission', { permissions: { database: true } }, 'PLUGIN_PERMISSION_DENIED']
] as const;
```

Add real ZIP fixtures containing `.node`, ELF magic `0x7f454c46`, PE magic `MZ`, Mach-O magic, executable mode bits, absolute symlinks, and relative symlinks escaping package root.

- [ ] **Step 3: Run tests and verify RED**

```bash
node --import tsx --test tests/regression/source-plugin-compatibility.test.ts tests/regression/source-plugin-package-security.test.ts
```

Expected: FAIL because the current parser accepts any non-empty runtime range and the verifier does not enforce the complete binary/module policy.

- [ ] **Step 4: Add stable compatibility error codes**

Add these codes to API and shared contracts:

```ts
| 'PLUGIN_RUNTIME_INCOMPATIBLE'
| 'PLUGIN_CAPABILITY_CONTRACT_UNSUPPORTED'
| 'PLUGIN_EXTENSION_CONTRACT_UNSUPPORTED'
| 'PLUGIN_EXTENSION_SCHEMA_INVALID'
```

- [ ] **Step 5: Implement deterministic compatibility reporting**

Use `semver.validRange()` and `semver.satisfies()`. Sort issues by `path`, then `code`, so diagnostics and snapshots are stable. Compile extension schemas with Ajv using `strict: true`, `allErrors: true`, and no remote schema loading.

- [ ] **Step 6: Strengthen package verification**

For every archive entry, inspect canonical path, symlink target, executable mode, extension, and first bytes. Return a typed fatal issue; do not extract forbidden entries. The process sandbox must repeat the root-boundary check at startup.

- [ ] **Step 7: Persist compatibility diagnostics with migration 20**

Add these columns to `source_reader_plugin_versions`:

```sql
ALTER TABLE source_reader_plugin_versions ADD COLUMN compatibility_issues_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE source_reader_plugin_versions ADD COLUMN activated_extensions_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE source_reader_plugin_versions ADD COLUMN sandbox_protocol_version INTEGER;
```

Installation stores the deterministic report and activation reads the stored activated extension set. Fatal integrity, policy, or compatibility issues call:

```ts
await store.quarantine(pluginId, version, fatalIssue.code);
```

Warnings remain queryable. Activation refuses any stored fatal issue and uses only `activatedExtensions` from the report.

- [ ] **Step 8: Run focused verification**

```bash
npm run check:lockfile
npm run check -w @novel-tool/api
node --import tsx --test tests/regression/source-plugin-compatibility.test.ts tests/regression/source-plugin-package-security.test.ts
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-plugin-installation.test.ts tests/integration/source-plugin-lifecycle-activation.test.ts
```

Expected: all pass; incompatible packages are quarantined and never start a process.

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/src/modules/source-reader/domain/plugin/source-reader-host-compatibility.ts apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts apps/api/src/modules/source-reader/application/services/plugin-compatibility.service.ts apps/api/src/modules/source-reader/application/services/plugin-installation.service.ts apps/api/src/modules/source-reader/application/services/plugin-activation.service.ts apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts apps/api/src/shared/database/sqlite.ts apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts packages/shared/src/index.ts tests/regression/source-plugin-compatibility.test.ts tests/regression/source-plugin-package-security.test.ts tests/integration/source-plugin-installation.test.ts tests/integration/source-plugin-lifecycle-activation.test.ts
git commit -m "feat(source-reader): enforce plugin compatibility and package policy"
```

---

### Task 6: Add Dedicated External `probeCanHandle`, Login, and Challenge RPC

**Files:**

- Create: `apps/api/src/modules/source-reader/domain/plugin/external-auth-rpc.ts`
- Create: `tests/integration/source-reader-external-auth-rpc.test.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.schema.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/plugin-matcher.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/authentication-orchestrator.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/auth-challenge.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/standard-authentication.service.ts`
- Modify: `apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts`

**Interfaces:**

- Consumes: activated authentication manifest extension, credential secret resolved by host, route identity, challenge repository.
- Produces:

```ts
export interface ExternalProbeRequest {
  normalizedUrl: string;
  domain: string;
  capability: SourceCapability;
}

export interface ExternalLoginRequest {
  strategy: 'custom';
  fields: Record<string, string>;
  routeIdentity: string;
}

export interface ExternalResumeChallengeRequest {
  challengeType: string;
  response: Record<string, string>;
  opaqueState: Record<string, unknown>;
  routeIdentity: string;
}
```

- [ ] **Step 1: Write failing DTO-boundary tests**

The hostile auth fixture must try to observe `context`, `repository`, `vault`, unrelated credential fields, and actor roles. Assert all are absent. Assert the supervisor receives operation names `probeCanHandle`, `login`, and `resumeChallenge`, not `invokeCapability`.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-external-auth-rpc.test.ts
```

Expected: FAIL because external loader registrations expose only the manifest and host matching/auth code cannot call dedicated RPC operations.

- [ ] **Step 3: Add a validated form-login manifest extension**

Add this shape to the manifest parser:

```ts
const formLoginSchema = z.object({
  loginUrlTemplate: z.string().url(),
  method: z.enum(['POST']),
  fields: z.object({ username: z.string().min(1), password: z.string().min(1) }),
  staticFields: z.record(z.string(), z.string()).default({}),
  success: z.object({
    status: z.array(z.number().int()).optional(),
    selector: z.string().optional()
  }),
  failure: z.object({
    status: z.array(z.number().int()).optional(),
    selector: z.string().optional()
  }),
  session: z.object({
    cookies: z.boolean().default(true),
    headers: z.array(z.string()).default([])
  })
});
```

At activation, require the login URL host to match the plugin matcher allowlist.

- [ ] **Step 4: Add external host proxies**

`ExternalPluginLoader` must produce a host-side `SourceReaderPlugin` whose `canHandle` and authentication methods call the supervisor. It must not attach a fake full `PluginContext`.

- [ ] **Step 5: Filter secret fields before custom auth RPC**

Resolve the credential in host code, then select only fields declared by the activated auth schema:

```ts
const filtered = Object.fromEntries(
  allowedFields.flatMap((field) =>
    typeof secret[field] === 'string' ? [[field, secret[field] as string]] : []
  )
);
```

The host still owns HTTP/browser calls and encrypted session persistence.

- [ ] **Step 6: Bind challenge and session results**

Persist opaque challenge state with plugin version and route identity. On resume, reject any version/route mismatch with `SESSION_BINDING_MISMATCH`; save the resulting session using the complete binding from Task 3.

- [ ] **Step 7: Run focused verification**

```bash
npm run check -w @novel-tool/api
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-external-auth-rpc.test.ts tests/integration/source-reader-session-login.test.ts tests/integration/source-reader-auth-challenge.test.ts tests/regression/source-reader-standard-auth.test.ts
```

Expected: all pass and snapshots contain no full context or undeclared secrets.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/source-reader/domain/plugin/external-auth-rpc.ts apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts apps/api/src/modules/source-reader/infrastructure/runtime/external-process apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.ts apps/api/src/modules/source-reader/application/services/plugin-matcher.ts apps/api/src/modules/source-reader/application/services/authentication-orchestrator.service.ts apps/api/src/modules/source-reader/application/services/auth-challenge.service.ts apps/api/src/modules/source-reader/application/services/standard-authentication.service.ts tests/integration/source-reader-external-auth-rpc.test.ts tests/integration/source-reader-session-login.test.ts tests/integration/source-reader-auth-challenge.test.ts tests/regression/source-reader-standard-auth.test.ts
git commit -m "feat(source-reader): add typed external authentication RPC"
```

#### Mandatory Checkpoint after Task 6

Run focused lifecycle/compatibility/auth verification, update the checkpoint file to 6 completed remediation tasks, commit metadata, and package `novel-tool-v2.9.6-source-reader-remediation-batch2-2026-07-20.zip` using the exact ZIP, SHA-256, `unzip -t`, restored `git fsck`, and restored `git status` procedure from Task 3. Stop implementation after verification.

---

### Task 7: Validate Concrete Capability Results and Activated Extensions

**Files:**

- Create: `apps/api/src/modules/source-reader/application/services/plugin-extension-validator.ts`
- Create: `tests/regression/source-reader-extension-validation.test.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/plugin-result-validator.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/cursor-codec.port.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/cursor/hmac-cursor.codec.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**

- Consumes: activated extension contracts from Task 5 and plugin operation results.
- Produces:

```ts
export interface ActivatedExtensionContract {
  namespace: string;
  version: string;
  required: boolean;
  validate(
    value: unknown
  ):
    | { success: true; data: unknown }
    | { success: false; issues: Array<{ path: string; message: string }> };
}

export interface ValidatedPluginResult<T> {
  data: T;
  extensions?: Record<string, VersionedExtensionValue>;
  warnings: SourceReaderWarning[];
}
```

- [ ] **Step 1: Write failing core and extension validation tests**

Add malformed search/latest cases:

```ts
const malformedSearch = {
  items: [{ title: '', url: 'not-a-url' }],
  hasMore: false
};
const malformedLatest = {
  items: [{ title: 'Novel', url: 'https://example.test/n', updatedAt: 42 }],
  hasMore: false
};
```

Add one required extension with invalid payload and one optional extension with invalid payload. Assert required failure throws `PLUGIN_RESULT_INVALID`; optional failure removes only that namespace and appends `PLUGIN_EXTENSION_OMITTED`.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/regression/source-reader-extension-validation.test.ts
```

Expected: FAIL because search/latest use `z.unknown()` and extensions are returned without validation.

- [ ] **Step 3: Add concrete shared item schemas**

Match the existing public interfaces exactly. At minimum:

```ts
const novelSearchResultSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  author: z.string().optional(),
  coverUrl: z.string().url().optional(),
  description: z.string().optional()
});

const latestUpdateSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  chapterTitle: z.string().optional(),
  chapterUrl: z.string().url().optional(),
  updatedAt: z.string().optional()
});
```

Update shared types only when the existing interface differs; schema and type must remain structurally identical.

- [ ] **Step 4: Implement activated extension validation**

Validate only namespaces from the activation report. Reject unknown result namespaces rather than trusting plugin-provided schema/version. For an optional invalid extension, emit:

```ts
{
  code: 'PLUGIN_EXTENSION_OMITTED',
  message: `Optional extension ${namespace}@${contract.version} was omitted`
}
```

Do not include raw extension values or Ajv internals in public error details.

- [ ] **Step 5: Bind extension versions into cursor payloads**

Extend cursor payloads with:

```ts
extensionContractVersions: Object.fromEntries(
  Object.entries(activatedExtensions)
    .map(([namespace, contract]) => [namespace, contract.version])
    .sort(([left], [right]) => left.localeCompare(right))
);
```

Decode must compare the complete sorted map and throw `CURSOR_INVALIDATED` on any change.

- [ ] **Step 6: Run focused verification**

```bash
npm run check -w @novel-tool/shared
npm run build:shared
npm run check -w @novel-tool/api
node --import tsx --test tests/regression/source-reader-extension-validation.test.ts tests/regression/source-reader-service.test.ts tests/regression/source-reader-cursor-clock.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/modules/source-reader/application/services/plugin-extension-validator.ts apps/api/src/modules/source-reader/application/services/plugin-result-validator.ts apps/api/src/modules/source-reader/application/services/source-reader.service.ts apps/api/src/modules/source-reader/application/ports/cursor-codec.port.ts apps/api/src/modules/source-reader/infrastructure/cursor/hmac-cursor.codec.ts tests/regression/source-reader-extension-validation.test.ts tests/regression/source-reader-service.test.ts tests/regression/source-reader-cursor-clock.test.ts
git commit -m "feat(source-reader): validate capability and extension contracts"
```

---

### Task 8: Implement Central Invalidation, Public Stale Refresh, and Real Persistent Cache Metadata

**Files:**

- Create: `apps/api/src/modules/source-reader/application/ports/source-reader-invalidation.port.ts`
- Create: `apps/api/src/modules/source-reader/application/services/source-reader-invalidation.service.ts`
- Create: `apps/api/src/modules/source-reader/application/services/public-cache-refresh.service.ts`
- Create: `tests/integration/source-reader-cache-invalidation.test.ts`
- Create: `tests/integration/source-reader-public-stale-cache.test.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/reader-cache.port.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/cache/memory-reader.cache.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/cache/sqlite-reader.cache.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/cache/tiered-reader.cache.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/use-cases/credentials/manage-credentials.usecase.ts`
- Modify: `apps/api/src/modules/source-reader/application/use-cases/network/manage-network-profiles.usecase.ts`
- Modify: `apps/api/src/modules/source-reader/application/use-cases/plugins/manage-source-plugins.usecase.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/authentication-orchestrator.service.ts`
- Modify: `apps/api/src/shared/database/sqlite.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`

**Interfaces:**

- Consumes: sessions, browser runtime, memory/persistent cache, observability, and typed mutation events.
- Produces:

```ts
export type SourceReaderInvalidationEvent =
  | { type: 'credential-updated' | 'credential-deleted'; credentialId: string }
  | { type: 'session-revoked' | 'logout'; sessionId: string }
  | { type: 'network-profile-updated' | 'network-profile-deleted'; networkIdentity: string }
  | {
      type: 'plugin-activated' | 'plugin-upgraded' | 'plugin-disabled' | 'plugin-quarantined';
      pluginId: string;
      pluginVersion?: string;
    }
  | { type: 'chapter-list-version-changed'; pluginId: string; normalizedUrl: string };

export interface ReaderCacheMetadata {
  pluginId: string;
  pluginVersion: string;
  capability: string;
  contractVersion: string;
  extensionContractVersions: Record<string, string>;
  requestFingerprint: string;
  scope: 'public' | 'account' | 'user' | 'session';
  scopeIdentityHash: string;
  networkIdentityHash: string;
  tags: string[];
}
```

- [ ] **Step 1: Write failing invalidation and stale tests**

Assert:

```ts
await expect(readExpired('public')).resolves.toMatchObject({
  warnings: [{ code: 'STALE_CACHE_USED' }]
});
await expect(readExpired('account')).resolves.not.toMatchObject({ source: 'stale-cache' });
await expect(readExpired('user')).resolves.not.toMatchObject({ source: 'stale-cache' });
await expect(readExpired('session')).resolves.not.toMatchObject({ source: 'stale-cache' });
```

Trigger two concurrent public stale reads and assert only one refresh invocation. Add rows for two users and public data, emit one credential update, and assert only matching account/session rows and browser/session handles are removed.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-cache-invalidation.test.ts tests/integration/source-reader-public-stale-cache.test.ts
```

Expected: FAIL because stale rows are never returned and invalidation is not wired.

- [ ] **Step 3: Add migration 21**

Add columns and a tag table:

```sql
ALTER TABLE source_reader_cache_entries ADD COLUMN extension_contract_versions_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE source_reader_cache_entries ADD COLUMN network_identity_hash TEXT;
CREATE TABLE source_reader_cache_tags (
  cache_key TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY(cache_key, tag),
  FOREIGN KEY(cache_key) REFERENCES source_reader_cache_entries(cache_key) ON DELETE CASCADE
);
CREATE INDEX idx_source_reader_cache_tags_tag ON source_reader_cache_tags(tag, cache_key);
```

Backfill `network_identity_hash` from `network_scope_hash`, then make repository writes use the new column. Do not drop the old column in this migration; removal can wait for a future table rebuild.

- [ ] **Step 4: Persist real cache metadata and indexed tags**

Change `ReaderCacheEntry` to include `metadata: ReaderCacheMetadata`. `SqliteReaderCache.set()` must write every field from metadata and replace tag rows transactionally. `invalidate(tags)` must use the tag index:

```sql
DELETE FROM source_reader_cache_entries
WHERE cache_key IN (
  SELECT cache_key FROM source_reader_cache_tags WHERE tag IN (?, ?, ?)
);
```

- [ ] **Step 5: Implement public-only stale refresh**

`PublicCacheRefreshService` holds `Map<string, Promise<void>>`. When a public row is between `expiresAt` and `staleUntil`, return it immediately with `STALE_CACHE_USED` and call `schedule(key, refresh)`. For authenticated scopes, treat expiration as a miss.

- [ ] **Step 6: Implement ordered invalidation**

For each event, resolve affected handles and perform:

```ts
await sessions.revokeMatching(event);
await browser.closeMatching(event);
await memoryCache.invalidate(tags);
await sqliteCache.invalidate(tags);
observability.invalidationFinished({ eventType: event.type, affectedCount });
```

Mutating use cases call invalidation only after their database mutation succeeds. For chapter lists, compute a stable SHA-256 fingerprint from ordered `{ index, title, url, publishedAt }` items. When a successful foreground or refresh result replaces a cached list with a different fingerprint, emit `chapter-list-version-changed` and invalidate matching chapter-list tags only.

- [ ] **Step 7: Run focused verification**

```bash
npm run check -w @novel-tool/api
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-schema.test.ts tests/integration/source-reader-cache-invalidation.test.ts tests/integration/source-reader-public-stale-cache.test.ts tests/integration/source-reader-cache-isolation.test.ts tests/regression/source-reader-management-usecases.test.ts tests/regression/source-reader-service.test.ts
```

Expected: all pass and schema version is 21.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/shared/database/sqlite.ts apps/api/src/modules/source-reader/application/ports/source-reader-invalidation.port.ts apps/api/src/modules/source-reader/application/ports/reader-cache.port.ts apps/api/src/modules/source-reader/application/services/source-reader-invalidation.service.ts apps/api/src/modules/source-reader/application/services/public-cache-refresh.service.ts apps/api/src/modules/source-reader/application/services/source-reader.service.ts apps/api/src/modules/source-reader/application/use-cases/credentials/manage-credentials.usecase.ts apps/api/src/modules/source-reader/application/use-cases/network/manage-network-profiles.usecase.ts apps/api/src/modules/source-reader/application/use-cases/plugins/manage-source-plugins.usecase.ts apps/api/src/modules/source-reader/application/services/authentication-orchestrator.service.ts apps/api/src/modules/source-reader/infrastructure/cache apps/api/src/shared/container/modules/source-reader.module.ts tests/integration/source-reader-cache-invalidation.test.ts tests/integration/source-reader-public-stale-cache.test.ts tests/integration/source-reader-cache-isolation.test.ts tests/integration/source-reader-schema.test.ts tests/regression/source-reader-management-usecases.test.ts tests/regression/source-reader-service.test.ts
git commit -m "feat(source-reader): coordinate cache and session invalidation"
```

---

### Task 9: Route Host and Plugin Logs Through a Bounded Structured Redaction Boundary

**Files:**

- Create: `apps/api/src/modules/source-reader/application/services/source-reader-structured-logger.ts`
- Create: `tests/regression/source-reader-structured-logging.test.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/observability/source-reader-observability.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/plugin-health.service.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`

**Interfaces:**

- Consumes: application `LoggerPort`, trusted request/plugin labels, untrusted plugin log events.
- Produces:

```ts
export interface PluginLogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SourceReaderStructuredLogger {
  host(event: string, metadata: Record<string, unknown>): void;
  plugin(
    trusted: { requestId: string; pluginId: string; pluginVersion: string; capability?: string },
    event: PluginLogEvent
  ): { accepted: boolean; violations: string[] };
}
```

- [ ] **Step 1: Write failing redaction and stream-policy tests**

Use a memory logger and pass values containing password, token, cookie, authorization, OTP, session, proxy password, secret query parameters, depth 10, arrays of 100 values, Buffer content, raw HTML, and chapter text. Spawn a fixture that writes secrets to stdout/stderr. Assert no captured log contains any secret substring.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/regression/source-reader-structured-logging.test.ts tests/regression/source-reader-observability.test.ts
```

Expected: FAIL because plugin context stringifies arbitrary metadata and process output is not governed by one logger.

- [ ] **Step 3: Implement fixed limits and allowlist**

Use constants:

```ts
const MAX_MESSAGE_BYTES = 2_048;
const MAX_METADATA_BYTES = 8_192;
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const ALLOWED_PLUGIN_METADATA_KEYS = new Set([
  'operation',
  'selector',
  'status',
  'durationMs',
  'itemCount',
  'warningCode',
  'url'
]);
```

Disallow `body`, `html`, `rawHtml`, `content`, `chapter`, `buffer`, and unknown keys. URL handling preserves scheme/host/path and replaces sensitive query values with `[REDACTED]`.

- [ ] **Step 4: Replace direct plugin and observability logging**

`PluginContextFactory.logger` and `InProcessSourceReaderObservability` call the structured logger. Host code supplies trusted labels separately; plugin metadata cannot override request ID, plugin ID/version, capability, or route type.

- [ ] **Step 5: Capture stdout/stderr as policy events**

Read child streams in bounded chunks. Emit only:

```ts
{
  event: 'source_reader.plugin_output_policy_violation',
  stream: 'stdout' | 'stderr',
  bytes: chunk.length,
  previewHash: sha256(chunk).slice(0, 16)
}
```

Never log raw stream content. Increment health failure count and quarantine after the configured threshold.

- [ ] **Step 6: Run focused verification**

```bash
npm run check -w @novel-tool/api
node --import tsx --test tests/regression/source-reader-structured-logging.test.ts tests/regression/source-reader-observability.test.ts tests/regression/source-reader-external-process-sandbox.test.ts
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-plugin-health.test.ts
```

Expected: all pass; secret substring scan is empty.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/source-reader/application/services/source-reader-structured-logger.ts apps/api/src/modules/source-reader/infrastructure/observability/source-reader-observability.ts apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts apps/api/src/modules/source-reader/application/services/plugin-health.service.ts apps/api/src/shared/container/modules/source-reader.module.ts tests/regression/source-reader-structured-logging.test.ts tests/regression/source-reader-observability.test.ts tests/regression/source-reader-external-process-sandbox.test.ts tests/integration/source-plugin-health.test.ts
git commit -m "fix(source-reader): enforce structured redacted logging"
```

#### Mandatory Checkpoint after Task 9

Run:

```bash
npm run check
node --import tsx --test tests/regression/source-reader-extension-validation.test.ts tests/regression/source-reader-structured-logging.test.ts tests/regression/source-reader-external-process-sandbox.test.ts
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-cache-invalidation.test.ts tests/integration/source-reader-public-stale-cache.test.ts
```

Update checkpoint metadata to 9 completed tasks, commit it, package `novel-tool-v2.9.6-source-reader-remediation-batch3-2026-07-20.zip`, generate SHA-256, and run the same archive/restored-Git checks from Task 3. Stop implementation.

---

### Task 10: Migrate Existing External Plugins, Sessions, and Cache Fail-Closed

**Files:**

- Create: `apps/api/src/modules/source-reader/application/services/external-plugin-revalidation.service.ts`
- Create: `tests/integration/source-reader-fail-closed-migration.test.ts`
- Modify: `apps/api/src/shared/database/sqlite.ts`
- Modify: `apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`

**Interfaces:**

- Consumes: package verifier, compatibility service, activation service, plugin store, invalidation service.
- Produces:

```ts
export interface ExternalPluginRevalidationResult {
  pluginId: string;
  version: string;
  status: 'active' | 'installed-pending-revalidation' | 'quarantined';
  reasonCode?: string;
}
```

- [ ] **Step 1: Write a schema-19 migration fixture and failing test**

Seed one built-in active plugin, one verified external active plugin, one external plugin whose package checksum changed, active external sessions, one public external cache row, and one authenticated external cache row. Open the database with current migrations.

- [ ] **Step 2: Run the test and verify RED**

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-fail-closed-migration.test.ts
```

Expected: FAIL because external active state, sessions, and cache survive unchanged.

- [ ] **Step 3: Add migration 22 and the new status**

Extend `PluginStatus` with `installed-pending-revalidation`. Migration SQL must:

```sql
UPDATE source_reader_plugin_versions
SET status='installed-pending-revalidation', activated_at=NULL
WHERE trust_level!='built-in' AND status='active';

UPDATE source_reader_plugins
SET active_version=NULL, enabled=0, status='installed-pending-revalidation'
WHERE trust_level!='built-in';

UPDATE source_reader_sessions
SET status='revoked'
WHERE plugin_id IN (
  SELECT id FROM source_reader_plugins WHERE trust_level!='built-in'
);

DELETE FROM source_reader_cache_entries
WHERE plugin_id IN (
  SELECT id FROM source_reader_plugins WHERE trust_level!='built-in'
);
```

Built-in rows remain unchanged.

- [ ] **Step 4: Revalidate package integrity at startup**

For each pending version, recompute checksum before compatibility. Missing/changed files call `quarantine(..., 'PLUGIN_PACKAGE_INVALID')`. Verified versions remain pending until the activation service completes.

- [ ] **Step 5: Keep rollback fail-closed**

Every active query must use exact status equality (`status='active'`) and exact non-null `active_version`; unknown statuses must never map to enabled. Add a regression assertion against permissive `status!='disabled'` queries.

- [ ] **Step 6: Run focused verification**

```bash
npm run check -w @novel-tool/api
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-fail-closed-migration.test.ts tests/integration/source-reader-schema.test.ts tests/integration/source-plugin-activation.test.ts tests/integration/backup-module.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/shared/database/sqlite.ts apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts apps/api/src/modules/source-reader/application/services/external-plugin-revalidation.service.ts apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts apps/api/src/shared/container/modules/source-reader.module.ts tests/integration/source-reader-fail-closed-migration.test.ts tests/integration/source-reader-schema.test.ts tests/integration/source-plugin-activation.test.ts
git commit -m "feat(source-reader): migrate external plugins fail closed"
```

---

### Task 11: Wire Diagnostics, Remove Legacy Worker Runtime, and Strengthen Architecture Gates

**Files:**

- Delete: `apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker/isolated-worker-plugin.runtime.ts`
- Delete: `apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker/plugin-worker.entry.ts`
- Delete: `apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker/worker-protocol.ts`
- Create: `tests/regression/source-reader-remediation-architecture.test.ts`
- Modify: `scripts/check-api-architecture.mjs`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Modify: `apps/api/src/modules/source-reader/presentation/controllers/source-reader-admin.controller.ts`
- Modify: `apps/api/src/modules/source-reader/presentation/routes/source-reader.routes.ts`
- Modify: `apps/api/src/modules/source-reader/presentation/dto/source-reader.dto.ts`
- Modify: `apps/api/src/modules/source-reader/public/source-reader.api.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `.env.example`
- Modify: `README.md`

**Interfaces:**

- Consumes: compatibility reports, lifecycle state, sandbox diagnostics, live network tester.
- Produces:

```ts
export interface SourceReaderPluginDiagnostics {
  pluginId: string;
  activeVersion?: string;
  status: string;
  lifecycleState: string;
  runtimeVersion: string;
  sandboxProtocolVersion: number;
  compatibilityIssues: Array<{
    code: string;
    path: string;
    severity: 'warning' | 'fatal';
    message: string;
  }>;
  lastHealth?: { status: string; checkedAt: string; failureCode?: string };
}
```

- [ ] **Step 1: Write failing architecture and HTTP contract tests**

Assert production source contains no `IsolatedWorkerPluginRuntime`, no external use of `node:worker_threads`, no RPC payload field named `context`, `repository`, or `vault`, no force-enable route, no placeholder route test, and no direct plugin import of network built-ins.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/regression/source-reader-remediation-architecture.test.ts tests/regression/source-reader-http-contract.test.ts
```

Expected: FAIL while the legacy isolated-worker directory and missing diagnostics route remain.

- [ ] **Step 3: Add safe plugin diagnostics**

Add `GET /api/source-reader/plugins/:pluginId`. Return only typed compatibility/lifecycle/health data. Strip package filesystem paths, proxy endpoints, checksums when policy marks them sensitive, raw errors, and plugin output.

- [ ] **Step 4: Replace placeholder health/test behavior**

Plugin health calls lifecycle `healthCheck` through built-in adapter or external supervisor. Network health calls `NetworkRouteTester`; it must never synthesize `latencyMs: 0` from stored state.

- [ ] **Step 5: Delete the legacy runtime and strengthen static gates**

Remove the isolated-worker directory and all imports. Extend `check-api-architecture.mjs` with exact forbidden patterns and a narrow allowlist for browser worker threads and hostile test fixtures.

- [ ] **Step 6: Add operational configuration and docs**

Document:

```text
SOURCE_READER_EXTERNAL_PROCESS_START_TIMEOUT_MS=10000
SOURCE_READER_PLUGIN_POLICY_VIOLATION_THRESHOLD=3
SOURCE_READER_NETWORK_DIAGNOSTIC_URL=https://example.com/
```

The diagnostics response may report configured timeout/threshold and Node runtime version but never secret route config.

- [ ] **Step 7: Run focused verification**

```bash
npm run check:arch
npm run check:web-contracts
npm run check -w @novel-tool/shared
npm run build:shared
npm run check -w @novel-tool/api
node --import tsx --test tests/regression/source-reader-remediation-architecture.test.ts tests/regression/source-reader-http-contract.test.ts
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-admin-http.test.ts tests/integration/source-reader-network-routing.test.ts
```

Expected: all pass and `rg -n 'isolated-worker|IsolatedWorkerPluginRuntime' apps/api/src` returns no results.

- [ ] **Step 8: Commit**

```bash
git add -A apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker apps/api/src/modules/source-reader apps/api/src/shared/container/modules/source-reader.module.ts packages/shared/src/index.ts scripts/check-api-architecture.mjs tests/regression/source-reader-remediation-architecture.test.ts tests/regression/source-reader-http-contract.test.ts tests/integration/source-reader-admin-http.test.ts tests/integration/source-reader-network-routing.test.ts .env.example README.md
git commit -m "refactor(source-reader): lock down remediated runtime boundaries"
```

---

### Task 12: Add Final Behavioral Acceptance and Prove the Entire Repository

**Files:**

- Create: `tests/regression/source-reader-remediation-final-lockdown.test.ts`
- Create: `tests/e2e/source-reader-remediation.spec.ts`
- Modify: `tests/regression/source-reader-final-lockdown.test.ts`
- Modify: `docs/superpowers/specs/2026-07-20-source-reader-security-remediation-design.md`
- Modify: `docs/superpowers/checkpoints/2026-07-20-source-reader-remediation.md`

**Interfaces:**

- Consumes: all previous remediation tasks and repository verification scripts.
- Produces: final design-to-test traceability and recoverable final checkpoint.

- [ ] **Step 1: Write the final traceability test**

Create a literal map so missing coverage fails visibly:

```ts
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
```

Assert each file exists and contains at least one behavioral assertion for its named invariant.

- [ ] **Step 2: Write E2E remediation scenarios**

Cover admin diagnostics, incompatible plugin quarantine, live route-test failure, and UI-safe error display. Inject known secret markers into server-side fixture errors and assert none appear in browser text, network response JSON, screenshots, or Playwright traces.

- [ ] **Step 3: Run the focused remediation suite**

```bash
node --import tsx --test tests/regression/source-reader-external-process-sandbox.test.ts tests/regression/source-plugin-compatibility.test.ts tests/regression/source-reader-extension-validation.test.ts tests/regression/source-reader-structured-logging.test.ts tests/regression/source-reader-remediation-architecture.test.ts tests/regression/source-reader-remediation-final-lockdown.test.ts
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-network-routing.test.ts tests/integration/source-reader-cache-scope-identity.test.ts tests/integration/source-reader-session-binding.test.ts tests/integration/source-plugin-lifecycle-activation.test.ts tests/integration/source-reader-external-auth-rpc.test.ts tests/integration/source-reader-cache-invalidation.test.ts tests/integration/source-reader-public-stale-cache.test.ts tests/integration/source-reader-fail-closed-migration.test.ts
```

Expected: all pass.

- [ ] **Step 4: Run exact repository acceptance**

Run in a persistent shell and record the final exit codes:

```bash
npm run verify
npm run test:e2e
```

Both commands must exit 0. Conditional browser skips are acceptable only when the existing repository policy explicitly allows them; the remediation E2E file itself must execute.

- [ ] **Step 5: Run final forbidden scans**

```bash
rg -n "IsolatedWorkerPluginRuntime|apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker|allowDirectFallback.*true|findActiveAnyRoute|authScope|z\.array\(z\.unknown\(\)\)|latencyMs:\s*0" apps packages scripts tests
rg -n "node:(fs|child_process|net|tls|dgram|http|https|worker_threads)" tests/fixtures/source-reader/external-plugins apps/api/src/modules/source-reader/infrastructure/runtime/external-process
```

Expected: first command has no production legacy hits. The second may match only hostile fixture strings and explicit deny-list definitions, never plugin execution imports.

- [ ] **Step 6: Update design and checkpoint with actual evidence**

Record commit IDs, exact test counts, exact command exit codes, remaining conditional skips, and the statement that Node permission controls are defense in depth while SES is the language-level authority boundary. Do not claim completion if any command lacks a final exit code.

- [ ] **Step 7: Commit**

```bash
git add tests/regression/source-reader-remediation-final-lockdown.test.ts tests/regression/source-reader-final-lockdown.test.ts tests/e2e/source-reader-remediation.spec.ts docs/superpowers/specs/2026-07-20-source-reader-security-remediation-design.md docs/superpowers/checkpoints/2026-07-20-source-reader-remediation.md
git commit -m "test(source-reader): complete security remediation acceptance"
```

#### Mandatory Final Checkpoint after Task 12

Package `novel-tool-v2.9.6-source-reader-remediation-final-2026-07-20.zip` with `.git`, generate SHA-256, run `unzip -t`, restore to a temporary directory, run `git fsck --full`, verify the restored branch/HEAD and clean status, and link both files in the completion report. Do not merge or delete `feat/source-reader` without an explicit user choice.

## Plan Self-Review Results

| Approved design area                                                                   | Implemented by tasks |
| -------------------------------------------------------------------------------------- | -------------------- |
| External process, SES authority boundary, loader, permissions, cancellation, watchdogs | 1, 9, 11             |
| Typed RPC, lifecycle, probes, custom authentication, challenges                        | 1, 4, 6              |
| HTTP/HTTPS/SOCKS routing, Chromium proxy, route health, no direct fallback             | 2, 11                |
| Cache scope identity, extension-aware keys, public stale behavior                      | 3, 7, 8              |
| Session version/owner/credential/route binding and invalidation                        | 3, 6, 8              |
| Atomic lifecycle activation and old-version retirement                                 | 4                    |
| SemVer, capability contracts, extensions, permissions, package policy                  | 5, 7                 |
| Structured redaction and plugin output policy                                          | 9                    |
| Fail-closed external migration and startup revalidation                                | 10                   |
| Architecture locks, admin diagnostics, full regression/build/E2E acceptance            | 11, 12               |

Self-review checks completed before plan commit:

- all 19 approved design sections map to at least one task;
- exactly 12 tasks are grouped into four mandatory three-task checkpoint batches;
- migration ordering is 20 for compatibility diagnostics, 21 for cache metadata/tags, and 22 for fail-closed rollout;
- later-task interfaces use the names and shapes introduced by earlier tasks;
- no placeholder markers, deferred implementation language, or unresolved alternative remains.
