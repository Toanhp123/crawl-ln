# Production Safety and Test Isolation Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Novel Tool safe by default on localhost, require a bearer-token boundary for LAN access, isolate every test file from developer storage and shared process state, reduce build peak memory, restore cross-platform scripts, and harden the built-in NovelCool parser.

**Architecture:** HTTP access policy is implemented in focused shared middleware and consumed by the existing Express composition root. Test and build orchestration remain root-level Node scripts but spawn short-lived child processes with explicit environments. NovelCool-specific page classification and selectors stay inside the built-in plugin adapter so Source Reader core contracts do not change except for one typed upstream-challenge error code.

**Tech Stack:** Node.js 22, TypeScript, Express, CORS, Node test runner, tsx, Vite, SQLite, Cheerio adapter, npm workspaces.

## Global Constraints

- API binds to `127.0.0.1` by default.
- Non-loopback `HOST` requires `API_REMOTE_TOKEN` of at least 32 characters.
- `/health` remains unauthenticated; remote `/api/*` requires a timing-safe bearer token.
- CORS uses an explicit allowlist and never accepts `*`.
- Source Reader default roles are `reader` only; local administration is opt-in with `SOURCE_READER_LOCAL_ADMIN=true`.
- Every test file runs in its own process with unique temporary storage and plugin directories.
- No `--experimental-test-isolation=none` and no `--test-force-exit` remain.
- Build phases run in separate child processes without nested npm chains.
- NovelCool fixtures are deterministic and redacted; `verify` performs no live request.
- Do not refactor unrelated application services or database migrations.

---

### Task 1: Secure API binding, CORS, and remote access

**Files:**
- Create: `apps/api/src/shared/http/network-address.ts`
- Create: `apps/api/src/shared/http/cors-options.ts`
- Create: `apps/api/src/shared/http/api-access.middleware.ts`
- Modify: `apps/api/src/shared/config/env.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/main.ts`
- Test: `tests/regression/api-access-security.test.ts`
- Test: `tests/integration/api-access-security.test.ts`

**Interfaces:**
- Produces `isLoopbackAddress(value: string | undefined): boolean`.
- Produces `createCorsOptions(origins: readonly string[]): CorsOptions`.
- Produces `apiAccessMiddleware({ remoteToken }): RequestHandler` and trusted request classification.
- Extends `env` with `host`, `apiCorsOrigins`, `apiRemoteToken`, and validated startup rules.

- [ ] **Step 1: Write failing environment and address tests**

Cover `127.0.0.1`, `::1`, `::ffff:127.0.0.1`, non-loopback addresses, wildcard CORS rejection, empty origins, and non-loopback host without a 32-character token.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --import tsx --test tests/regression/api-access-security.test.ts
```

Expected: failures because the HTTP security helpers and environment fields do not exist.

- [ ] **Step 3: Implement validated environment and shared HTTP helpers**

Use `timingSafeEqual()` only after equal byte-length validation. Ignore `Host`, `Origin`, forwarding headers, and role headers when determining local/remote access; use `request.socket.remoteAddress` only.

- [ ] **Step 4: Write and run integration tests**

Verify `/health` is public, remote `/api/*` returns `401` for missing/wrong tokens, the correct token passes the access middleware, and non-allowlisted origins are rejected.

- [ ] **Step 5: Wire middleware and bind host**

Apply middleware order: strict CORS → JSON parser → health → API access guard → routes → 404 → error handler. Call `listen(env.port, env.host)`.

- [ ] **Step 6: Run focused tests and commit**

```bash
node --import tsx --test tests/regression/api-access-security.test.ts tests/integration/api-access-security.test.ts
git add apps/api/src/shared/http apps/api/src/shared/config/env.ts apps/api/src/app.ts apps/api/src/main.ts tests/regression/api-access-security.test.ts tests/integration/api-access-security.test.ts
git commit -m "fix: secure api network defaults"
```

---

### Task 2: Restrict Source Reader administration roles

**Files:**
- Modify: `apps/api/src/modules/source-reader/presentation/source-reader-actor.middleware.ts`
- Modify: `apps/api/src/modules/source-reader/presentation/routes/source-reader.routes.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Modify: `apps/api/src/shared/config/env.ts`
- Test: `tests/regression/source-reader-authorization.test.ts`
- Test: `tests/integration/source-reader-admin-http.test.ts`

**Interfaces:**
- Actor middleware consumes trusted access classification from Task 1.
- Actor options expose `localAdminEnabled` and `trustRoleHeaders`; default roles are no longer environment JSON.

- [ ] **Step 1: Add failing authorization cases**

Assert default actors have only `reader`; loopback actors receive admin roles only with local admin enabled; remote role headers cannot grant privileges; trusted headers are intersected with mode-allowed roles.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/regression/source-reader-authorization.test.ts tests/integration/source-reader-admin-http.test.ts
```

- [ ] **Step 3: Implement role derivation at the presentation boundary**

Remove `SOURCE_READER_DEFAULT_ROLES_JSON`. Determine allowed roles from trusted local/remote classification and `SOURCE_READER_LOCAL_ADMIN`.

- [ ] **Step 4: Run focused tests and commit**

```bash
node --import tsx --test tests/regression/source-reader-authorization.test.ts tests/integration/source-reader-admin-http.test.ts
git add apps/api/src/modules/source-reader/presentation apps/api/src/shared/container/modules/source-reader.module.ts apps/api/src/shared/config/env.ts tests/regression/source-reader-authorization.test.ts tests/integration/source-reader-admin-http.test.ts
git commit -m "fix: restrict source reader administration"
```

---

### Task 3: Isolate every test file and protect developer storage

**Files:**
- Modify: `scripts/run-test-files.mjs`
- Modify: `scripts/verify.mjs`
- Create: `scripts/run-single-test-file.mjs`
- Test: `tests/regression/project-test-runner.test.ts`
- Test: `tests/regression/test-storage-isolation.test.ts`
- Modify: integration tests that leave open handles, only where the new runner exposes a real lifecycle leak.

**Interfaces:**
- Parent runner discovers files, limits concurrency, and launches one child per file.
- Child receives unique `STORAGE_DIR` and `SOURCE_READER_PLUGIN_DIR`, then exits naturally.
- Timeout failure reports the exact test path and terminates the child tree.

- [ ] **Step 1: Extend runner regression tests**

Assert forbidden flags are absent, each file gets a separate process/environment, temporary directories are removed, timeout is visible, and project-local storage is untouched.

- [ ] **Step 2: Run runner tests and verify RED**

```bash
node --import tsx --test tests/regression/project-test-runner.test.ts tests/regression/test-storage-isolation.test.ts
```

- [ ] **Step 3: Implement per-file process isolation**

Use `mkdtemp(join(tmpdir(), ...))`, create `storage` and `plugins`, spawn Node with `--import tsx --test <file>`, and remove the suite directory in `finally`. Do not use force-exit or isolation-disabled flags.

- [ ] **Step 4: Run regression and integration suites**

```bash
npm run test:regression
npm run test:integration
```

If a test process times out, fix that test/runtime cleanup rather than adding force-exit.

- [ ] **Step 5: Assert repository storage remains unchanged and commit**

```bash
test ! -e storage/novel-tool.sqlite
node --import tsx --test tests/regression/project-test-runner.test.ts tests/regression/test-storage-isolation.test.ts
git add scripts tests
git commit -m "test: isolate test files and runtime storage"
```

---

### Task 4: Reduce build memory and restore cross-platform scripts

**Files:**
- Create: `apps/api/scripts/build.mjs`
- Modify: `apps/api/package.json`
- Modify: `scripts/build-prepared.mjs`
- Modify: `scripts/clean.mjs`
- Test: `tests/regression/project-command-graph.test.ts`
- Test: `tests/regression/project-clean-command.test.ts`
- Test: `tests/regression/windows-portability.test.ts`

**Interfaces:**
- API build script invokes TypeScript then copies `sandbox-entry.mjs` with Node filesystem APIs.
- Root build script runs API emit, Web no-emit check, and Vite build as three direct child processes.
- Clean guard uses `path.relative()` and refuses root/outside paths on POSIX and Windows-style cases.

- [ ] **Step 1: Write failing portability and process-isolation tests**

Cover absence of `mkdir -p`/`cp`, separate build child phases, and Windows/POSIX inside/outside path guards.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/regression/project-command-graph.test.ts tests/regression/project-clean-command.test.ts tests/regression/windows-portability.test.ts
```

- [ ] **Step 3: Implement Node-based API build and isolated root phases**

Spawn executables directly with inherited stdio. A non-zero child exit must stop the build immediately.

- [ ] **Step 4: Implement cross-platform clean guard**

Use `relative(root, target)`, reject empty relative paths, values starting with `..`, and absolute relative results.

- [ ] **Step 5: Run clean/check/build and commit**

```bash
npm run clean
npm run check
npm run build
git add apps/api/scripts apps/api/package.json scripts tests/regression/project-command-graph.test.ts tests/regression/project-clean-command.test.ts tests/regression/windows-portability.test.ts
git commit -m "build: isolate phases and restore portability"
```

---

### Task 5: Harden the NovelCool built-in plugin

**Files:**
- Create: `apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool-page-classifier.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.parsers.ts`
- Modify: `apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts`
- Create: `tests/fixtures/source-reader/novelcool-current-novel.html`
- Create: `tests/fixtures/source-reader/novelcool-challenge.html`
- Create: `tests/fixtures/source-reader/novelcool-duplicate-chapters.html`
- Create: `tests/fixtures/source-reader/novelcool-empty-valid.html`
- Modify: `tests/regression/source-reader-novelcool-plugin.test.ts`

**Interfaces:**
- Adds error code `UPSTREAM_CHALLENGE_DETECTED`.
- Produces a redacted page classification and selector counts.
- Chapter extraction normalizes/deduplicates URLs and preserves detected source order.

- [ ] **Step 1: Add failing fixture tests**

Cover current selector variants, duplicate links, ascending and descending DOM order, challenge/access-denied pages, and valid pages with no chapters.

- [ ] **Step 2: Run NovelCool tests and verify RED**

```bash
node --import tsx --test tests/regression/source-reader-novelcool-plugin.test.ts
```

- [ ] **Step 3: Implement classification and chapter extraction**

Use only redacted signals in error details: final URL, title, page class, and selector counts. Never include raw HTML, cookies, or headers.

- [ ] **Step 4: Run Source Reader focused suites and commit**

```bash
node --import tsx --test tests/regression/source-reader-novelcool-plugin.test.ts tests/regression/source-reader-plugin-contract.test.ts tests/regression/source-reader-service.test.ts
git add apps/api/src/modules/source-reader tests/fixtures/source-reader tests/regression/source-reader-novelcool-plugin.test.ts
git commit -m "fix: harden novelcool page parsing"
```

---

### Task 6: Update configuration, docs, metadata, and final verification

**Files:**
- Modify: `README.md`
- Modify: `docs/SOURCE_READER.md`
- Modify: `docs/frontend/PERFORMANCE_BASELINE.md`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/.env.termux.example`
- Delete: `.env.example`
- Modify: `apps/web/vite.config.ts`
- Modify: `scripts/check-docs.mjs`
- Test: `tests/regression/project-docs-check.test.ts`
- Test: `tests/regression/final-cleanup-lockdown.test.ts`

**Interfaces:**
- Web build ID resolves from `APP_BUILD`, Git commit when available, then package version.
- Documentation checker validates local Markdown links for every retained Markdown file.

- [ ] **Step 1: Add failing docs/config tests**

Assert safe environment examples, no root `.env.example`, no stale build literal, all Markdown local links checked, and Source Reader docs omit retired default-role configuration.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/regression/project-docs-check.test.ts tests/regression/final-cleanup-lockdown.test.ts
```

- [ ] **Step 3: Update canonical documentation and examples**

Document local mode and explicit LAN mode with a 32+ character token. Update test counts from the final run, not estimates.

- [ ] **Step 4: Run all public gates from the working tree**

```bash
npm run clean
npm run verify
```

Expected: natural exit, zero failures, no project-local SQLite database created.

- [ ] **Step 5: Verify from a clean clone**

```bash
git clone --no-local . /tmp/novel-tool-safety-verify
cd /tmp/novel-tool-safety-verify
npm ci
npm run verify
```

Record wall-clock and peak-memory observations in `docs/frontend/PERFORMANCE_BASELINE.md` only after fresh measurement.

- [ ] **Step 6: Remove temporary plan/spec files, commit, and package**

Remove `docs/superpowers` from the final working tree after all acceptance criteria pass; Git history retains the design and plan.

```bash
git add -A
git commit -m "docs: document safe local and lan operation"
```
