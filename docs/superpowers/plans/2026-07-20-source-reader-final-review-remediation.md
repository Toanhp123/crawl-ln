# Source Reader Final Review Remediation Implementation Plan

> **Historical note:** This completed plan is superseded for current acceptance by `2026-07-20-source-reader-post-review-remediation.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four runtime gaps found by the independent final review: atomic activation consistency, exact session route binding, immediate external registration parity, and browser/HTML RPC parity.

**Architecture:** Keep the existing Source Reader bounded-context boundaries. Add explicit rollback/finalization semantics around registry publication, make session lookup route-exact, centralize external registration construction in one factory shared by activation and startup loading, and extend the sandbox host bridge with opaque browser/DOM handles rather than serializing host objects.

**Tech Stack:** TypeScript, Node.js 22+, node:test, Zod RPC schemas, SQLite, existing external-process supervisor and Source Reader ports.

## Global Constraints

- Use TDD: every production change starts from a failing behavioral test.
- Do not weaken sandbox deny-by-default policy or expose repositories, vaults, actors, or raw host objects to plugins.
- External plugin browser and HTML access must remain host-mediated through bounded RPC DTOs.
- Preserve typed Source Reader errors and current public HTTP contracts.
- After Task 3: stop, verify, commit checkpoint metadata, create ZIP + SHA-256, and restore-test the archive before starting Task 4.

---

### Task 1: Make Plugin Activation, Disable, and Quarantine State Consistent

**Files:**
- Modify: `apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/plugin-activation.service.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts`
- Modify: `tests/integration/source-plugin-lifecycle-activation.test.ts`

**Interfaces:**
- Consumes: `PluginRegistryPort.prepareRegistration()`, `publishPrepared()`, and the current active plugin snapshot.
- Produces: store transition methods that can finalize or restore the previous active version after registry publication failure.

- [ ] **Step 1: Add failing activation publication tests**

Add tests proving:

```ts
publishPrepared() throws after the store transition;
activate() rejects with PLUGIN_LIFECYCLE_FAILED;
the previous version remains active in the store;
the previous registry snapshot remains published;
the candidate process is terminated.
```

Also add disable/quarantine tests proving a failed store transition restores the previous registry snapshot.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --import tsx --test tests/integration/source-plugin-lifecycle-activation.test.ts
```

Expected: FAIL because the store remains on the candidate after publication failure and registry removal is not rolled back.

- [ ] **Step 3: Add reversible store transitions**

Extend the store port with explicit transition operations:

```ts
interface PluginActivationTransition {
  previousVersion?: string;
  candidateVersion: string;
}

beginActivation(pluginId: string, candidateVersion: string, activatedAt: string): Promise<PluginActivationTransition>;
restoreActivation(pluginId: string, transition: PluginActivationTransition): Promise<void>;
finalizeActivation(pluginId: string, transition: PluginActivationTransition): Promise<void>;
```

Implement them transactionally in SQLite. `beginActivation` records the previous version and a transitional candidate state; `finalizeActivation` commits the candidate as active; `restoreActivation` returns the database to the previous active version.

For disable and quarantine, capture the registry snapshot before publication and republish it if the store operation fails.

- [ ] **Step 4: Reorder activation orchestration**

Use this order:

```ts
const previousRegistry = registry.snapshot();
const prepared = registry.prepareRegistration(previousRegistry, registration);
const transition = await store.beginActivation(...);
try {
  registry.publishPrepared(prepared);
  await store.finalizeActivation(...);
} catch (error) {
  registry.publishPrepared({ registrations: new Map(previousRegistry) });
  await store.restoreActivation(...);
  throw error;
}
```

Only shut down the old version after both registry publication and database finalization succeed.

- [ ] **Step 5: Run verification**

Run:

```bash
node --import tsx --test tests/integration/source-plugin-lifecycle-activation.test.ts
npm run typecheck --workspace @novel-tool/api
npm run test:architecture --workspace @novel-tool/api
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts \
  apps/api/src/modules/source-reader/application/services/plugin-activation.service.ts \
  apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts \
  tests/integration/source-plugin-lifecycle-activation.test.ts
git commit -m "fix(source-reader): make plugin publication atomic"
```

---

### Task 2: Enforce Exact Session Route Binding for Every Session

**Files:**
- Modify: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts`
- Modify: `tests/integration/source-reader-session-binding.test.ts`

**Interfaces:**
- Consumes: `SessionRepository.findActive()` with plugin/version/credential/owner/network identity.
- Produces: exact route matching for all active sessions; `networkBinding` controls whether a session is required, not whether it may move between routes.

- [ ] **Step 1: Add failing optional-binding regression**

Create an active session with:

```ts
networkProfileId: 'proxy-a'
networkBinding: 'optional'
```

Assert that lookup with `proxy-b` or direct does not return that session. The expected result is `undefined`; only an exact `proxy-a` lookup returns the handle.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --import tsx --test tests/integration/source-reader-session-binding.test.ts
```

Expected: FAIL because the repository currently falls back to a query without `network_profile_id`.

- [ ] **Step 3: Remove cross-route fallback**

Delete the alternate route lookup. Query active sessions once using exact:

```sql
AND network_profile_id IS ?
```

Keep `SESSION_BINDING_MISMATCH` only for an explicitly supplied stale handle/material-resolution path if required elsewhere; `findActive()` must never return a session from another route.

- [ ] **Step 4: Run verification**

Run:

```bash
node --import tsx --test tests/integration/source-reader-session-binding.test.ts
node --import tsx --test tests/integration/source-reader-authenticated-read.test.ts
npm run typecheck --workspace @novel-tool/api
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts \
  tests/integration/source-reader-session-binding.test.ts
git commit -m "fix(source-reader): bind sessions to exact network route"
```

---

### Task 3: Use One External Plugin Registration Factory at Activation and Startup

**Files:**
- Create: `apps/api/src/modules/source-reader/application/services/external-plugin-registration.factory.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/plugin-activation.service.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Create: `tests/integration/source-reader-external-registration-parity.test.ts`

**Interfaces:**
- Consumes: `StoredPluginVersion`, `ExternalPluginSupervisorPort`, ID/clock/deadline dependencies, and activated extension validators.
- Produces:

```ts
interface ExternalPluginRegistrationFactory {
  create(version: StoredPluginVersion): Promise<RegisteredPlugin>;
}
```

The returned plugin must include identical manifest, lifecycle, `canHandle`, and custom authentication proxies regardless of whether it is created during activation or startup loading.

- [ ] **Step 1: Add failing registration parity test**

Build one registration through activation and one through startup loading. Assert both expose:

```ts
typeof registration.plugin.canHandle === 'function'
typeof registration.plugin.authentication?.login === 'function'
typeof registration.plugin.authentication?.resumeChallenge === 'function'
```

Invoke each proxy and assert the supervisor receives dedicated operations `probeCanHandle`, `login`, and `resumeChallenge` with the same bounded DTOs.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --import tsx --test tests/integration/source-reader-external-registration-parity.test.ts
```

Expected: FAIL because activation currently builds only manifest + lifecycle.

- [ ] **Step 3: Extract the factory**

Move all registration construction from `ExternalPluginLoader.plugin()` into `ExternalPluginRegistrationFactory.create()`. The factory must:

```ts
loadActivatedExtensionContracts(...)
construct lifecycle proxies
construct probeCanHandle proxy
construct custom login/resumeChallenge proxies
set trustLevel, executionMode, enabled, packagePath
```

`ExternalPluginLoader.loadActive()` delegates to the factory after integrity verification. `PluginActivationService.activate()` delegates to the same factory before registry preparation.

- [ ] **Step 4: Compose one factory instance**

Create a single factory in the composition-root `source-reader.module.ts` and inject it into both loader and activation service. Remove duplicate private registration/lifecycle/request construction.

- [ ] **Step 5: Run verification**

Run:

```bash
node --import tsx --test tests/integration/source-reader-external-registration-parity.test.ts
node --import tsx --test tests/integration/source-reader-external-authentication.test.ts
node --import tsx --test tests/integration/source-plugin-lifecycle-activation.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit and checkpoint**

```bash
git add apps/api/src/modules/source-reader/application/services/external-plugin-registration.factory.ts \
  apps/api/src/modules/source-reader/application/services/plugin-activation.service.ts \
  apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.ts \
  apps/api/src/shared/container/modules/source-reader.module.ts \
  tests/integration/source-reader-external-registration-parity.test.ts
git commit -m "refactor(source-reader): unify external plugin registration"
```

Then stop implementation, run batch verification, update checkpoint metadata, create ZIP + SHA-256, and restore-test the archive before Task 4.

---

### Task 4: Add Browser and Complete HTML RPC Parity

**Files:**
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.schema.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-entry.mjs`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/opaque-html-handle.store.ts`
- Create: `tests/regression/source-reader-external-context-parity.test.ts`

**Interfaces:**
- Consumes: host `PluginContext.browser` and `PluginContext.html` services.
- Produces: bounded host calls for browser operations and opaque HTML document/node handles.

- [ ] **Step 1: Add failing context parity tests**

Use an external sandbox plugin that calls:

```ts
context.html.load('<ul><li>A</li><li>B</li></ul>').all('li')
context.html.load(...).remove('.ad')
context.browser.open(url)
context.browser.text('h1')
```

Assert the plugin receives two nodes, removal changes serialized HTML, and browser calls reach the host browser port. Also assert no host object or DOM object crosses the RPC boundary.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --test tests/regression/source-reader-external-context-parity.test.ts
```

Expected: FAIL because `browser` is undefined, `html.all()` returns `[]`, and `html.remove()` is a no-op.

- [ ] **Step 3: Add opaque HTML handles**

The host stores loaded documents and selected nodes by random opaque IDs scoped to one request. RPC methods accept/return only bounded JSON:

```text
html.load -> documentId
html.text/attr/html/all/remove -> strings, string[], or nodeId[]
```

All handles are released when the sandbox request completes or is cancelled.

- [ ] **Step 4: Add browser RPC methods**

Expose only the existing browser port operations:

```text
browser.open
browser.waitFor
browser.text
browser.html
browser.click
browser.fillSecret
browser.cookies
```

Validate every method and argument with Zod. Secrets remain opaque handles where the existing browser port requires them.

- [ ] **Step 5: Fix in-process HTML node parity**

Ensure `PluginHtmlNode.html()` returns the selected node HTML rather than an empty string, and add focused tests for node `text`, `attr`, and `html`.

- [ ] **Step 6: Run final verification and commit**

```bash
node --import tsx --test tests/regression/source-reader-external-context-parity.test.ts
node --import tsx --test tests/regression/source-reader-external-process-sandbox.test.ts
npm run verify
npm run test:e2e
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/modules/source-reader/infrastructure/runtime/external-process \
  apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts \
  tests/regression/source-reader-external-context-parity.test.ts
git commit -m "feat(source-reader): complete external context RPC parity"
```
