# Source Plugin SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an official `@novel-tool/source-plugin-sdk` workspace package and make it the canonical external plugin contract used by the API and sandbox boundary.

**Architecture:** The SDK owns external-facing manifest, normalized model, lifecycle/authentication, context, plugin, and safe-error contracts. The API re-exports shared public models and keeps only host-only request context plus synchronous built-in context. Runtime tests prove that the asynchronous external contract matches RPC behavior and that safe plugin errors survive process isolation.

**Tech Stack:** TypeScript 5.5, Node.js 22 ESM, npm workspaces, Node test runner, Zod host validation, SES external process sandbox.

## Global Constraints

- Preserve the synchronous internal `PluginContext` for built-in plugins.
- External HTML document/node operations and URL/logger RPC operations remain asynchronous.
- Do not allow arbitrary bare imports in the sandbox.
- SDK has zero runtime dependencies and no import from `apps/api`.
- Public tutorial/reference documentation remains deferred.
- Use TDD for every behavior change.
- Keep root command graph cross-platform and without nested npm orchestration.

---

### Task 1: SDK package and external contract

**Files:**
- Create: `packages/source-plugin-sdk/package.json`
- Create: `packages/source-plugin-sdk/tsconfig.json`
- Create: `packages/source-plugin-sdk/src/capabilities.ts`
- Create: `packages/source-plugin-sdk/src/models.ts`
- Create: `packages/source-plugin-sdk/src/manifest.ts`
- Create: `packages/source-plugin-sdk/src/context.ts`
- Create: `packages/source-plugin-sdk/src/plugin.ts`
- Create: `packages/source-plugin-sdk/src/errors.ts`
- Create: `packages/source-plugin-sdk/src/index.ts`
- Test: `tests/regression/source-plugin-sdk-contract.test.ts`
- Test fixture: `tests/fixtures/source-reader/sdk-plugin/src/index.ts`
- Test fixture: `tests/fixtures/source-reader/sdk-plugin/tsconfig.json`

**Interfaces:**
- Produces: `SourceCapability`, `SourcePluginManifest`, normalized models, `PluginOperationResult<T>`, `ExternalPluginContext`, `ExternalSourcePlugin`, `SourcePluginError`, `defineSourcePlugin`, and `defineSourcePluginManifest`.

- [ ] **Step 1: Write failing SDK package contract tests**

Create a regression test that asserts the package exists, contains no API import, builds declarations, and type-checks a fixture using `satisfies ExternalSourcePlugin` with asynchronous HTML/URL/logger operations.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --import tsx --test tests/regression/source-plugin-sdk-contract.test.ts
```

Expected: fail because `packages/source-plugin-sdk` does not exist.

- [ ] **Step 3: Implement the minimal SDK package**

Define exact capability constants and method mapping, normalized models, manifest types, asynchronous RPC context, external lifecycle/auth method signatures, identity helpers, and safe error class.

- [ ] **Step 4: Run focused package checks and verify GREEN**

Run:

```bash
npm run check -w @novel-tool/source-plugin-sdk
npm run build -w @novel-tool/source-plugin-sdk
node --import tsx --test tests/regression/source-plugin-sdk-contract.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/source-plugin-sdk tests/regression/source-plugin-sdk-contract.test.ts tests/fixtures/source-reader/sdk-plugin
git commit -m "feat: add official source plugin sdk"
```

### Task 2: Make API consume canonical SDK contracts

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/modules/source-reader/public/source-reader.models.ts`
- Modify: `apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts`
- Modify: `apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts`
- Modify: `apps/api/src/modules/source-reader/domain/plugin/plugin-lifecycle.ts`
- Modify: `apps/api/src/modules/source-reader/domain/plugin/external-auth-rpc.ts`
- Modify: `apps/api/src/modules/source-reader/domain/auth/authentication.ts`
- Test: `tests/regression/source-plugin-sdk-api-parity.test.ts`

**Interfaces:**
- Consumes: SDK contracts from Task 1.
- Produces: API re-exports and internal built-in interfaces that compile against the SDK source of truth.

- [ ] **Step 1: Write failing API parity tests**

Assert API public models re-export SDK normalized types, manifest schema uses SDK capability constants, and API domain files do not redefine external auth/lifecycle/manifest contracts.

- [ ] **Step 2: Run focused parity test and verify RED**

Run:

```bash
node --import tsx --test tests/regression/source-plugin-sdk-api-parity.test.ts
```

Expected: fail on duplicated local definitions.

- [ ] **Step 3: Migrate API types to SDK imports/re-exports**

Keep host-only request context and `SourceReaderResult<T>` in the API. Retain synchronous built-in HTML/context interfaces but import manifest, normalized models, lifecycle, authentication, and operation result types from the SDK.

- [ ] **Step 4: Run API and focused tests**

Run:

```bash
npm install --package-lock-only
npm run build -w @novel-tool/source-plugin-sdk
npm run check -w @novel-tool/api
node --import tsx --test tests/regression/source-plugin-sdk-api-parity.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api package-lock.json tests/regression/source-plugin-sdk-api-parity.test.ts
git commit -m "refactor: use sdk source plugin contracts"
```

### Task 3: Preserve safe external plugin errors

**Files:**
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts`
- Test: `tests/regression/source-plugin-sdk-sandbox-errors.test.ts`

**Interfaces:**
- Consumes: `SOURCE_PLUGIN_ERROR_CODES` and `SourcePluginErrorCode` from the SDK.
- Produces: sandbox errors mapped to host `SourceReaderError` with host-owned retry/fallback policy.

- [ ] **Step 1: Write failing sandbox error tests**

Create temporary external plugins that throw `SourcePluginError`-shaped errors. Assert `UPSTREAM_CHALLENGE_DETECTED` survives and an unknown/internal code becomes `PLUGIN_UNAVAILABLE`.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node --import tsx --test tests/regression/source-plugin-sdk-sandbox-errors.test.ts
```

Expected: safe code currently collapses to `PLUGIN_UNAVAILABLE`.

- [ ] **Step 3: Implement allowlisted error mapping**

Map only SDK safe codes to `SourceReaderError`. Keep message bounded and assign retry/fallback policy in the host. Do not accept plugin-provided details, causes, retry flags, or fallback flags.

- [ ] **Step 4: Run sandbox tests and verify GREEN**

Run:

```bash
node --import tsx --test tests/regression/source-plugin-sdk-sandbox-errors.test.ts tests/regression/source-reader-external-process-sandbox.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts tests/regression/source-plugin-sdk-sandbox-errors.test.ts
git commit -m "fix: preserve safe external plugin errors"
```

### Task 4: Integrate SDK into build and verification

**Files:**
- Create: `scripts/prepare-sdk.mjs`
- Create: `scripts/prepare-packages.mjs`
- Modify: `scripts/build-prepared.mjs`
- Modify: `scripts/check-prepared.mjs`
- Modify: `scripts/verify.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/clean.mjs`
- Test: `tests/regression/source-plugin-sdk-build-graph.test.ts`

**Interfaces:**
- Produces: `prepare:packages`, `build:sdk`, `check:sdk`, SDK cleanup, and one-pass SDK preparation in public commands.

- [ ] **Step 1: Write failing build graph tests**

Assert public commands prepare SDK before API, `verify` has one package-preparation step, clean removes SDK dist, and build/check scripts remain Node-based and cross-platform.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node --import tsx --test tests/regression/source-plugin-sdk-build-graph.test.ts
```

Expected: fail because SDK is absent from command graph.

- [ ] **Step 3: Implement package preparation and cleanup**

Compile shared and SDK once before prepared checks/builds. Include SDK TypeScript checking, preserve existing process isolation, and update lockfile portability expectations.

- [ ] **Step 4: Run public commands**

Run:

```bash
npm ci
npm run clean
npm run check
npm run build
node --import tsx --test tests/regression/source-plugin-sdk-build-graph.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts tests/regression/source-plugin-sdk-build-graph.test.ts
git commit -m "build: integrate source plugin sdk"
```

### Task 5: Final verification and temporary workflow cleanup

**Files:**
- Delete: `docs/superpowers/specs/2026-07-21-source-plugin-sdk-design.md`
- Delete: `docs/superpowers/plans/2026-07-21-source-plugin-sdk-implementation.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: clean release candidate without public plugin docs yet.

- [ ] **Step 1: Record the SDK package in the changelog**

Document the official SDK, canonical contract migration, and safe sandbox error preservation without adding tutorial/reference material.

- [ ] **Step 2: Remove temporary workflow documents**

Delete the temporary spec and plan so the repository documentation policy remains unchanged.

- [ ] **Step 3: Run full clean verification**

Run:

```bash
npm run clean
npm ci
npm run verify
```

Expected: regression and integration suites pass with zero failures; only the existing conditional Chromium skip may remain.

- [ ] **Step 4: Verify repository hygiene**

Run:

```bash
git status --short
git fsck --full
test ! -e storage/novel-tool.sqlite
```

Expected: no uncommitted files, Git object database clean, and no project storage leak.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: finalize source plugin sdk"
```
