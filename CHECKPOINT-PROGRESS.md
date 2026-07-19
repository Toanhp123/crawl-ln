# Source Reader Implementation Checkpoint

**Checkpoint date:** 2026-07-20  
**Branch:** `feat/source-reader`  
**Base source:** `novel-tool-v2.9.6-optimistic-switch-ui(1).zip`  
**Primary roadmap:** `docs/superpowers/plans/2026-07-19-source-reader-implementation-roadmap.md`

## Important truth about this checkpoint

This package contains the latest **recoverable and verified** source after the sandbox reset.
Earlier temporary work in prior sessions reached later phases, but those files and commits were lost when the temporary mount reset. They are **not** considered implemented in this checkpoint.

The reliable implementation position is:

- Core Runtime Plan — Task 1: **complete and committed**.
- Core Runtime Plan — Task 2: **complete and committed**.
- Core Runtime Plan — Task 3: **started; RED test written but implementation not created**.
- Core Runtime Plan — Tasks 4–6: **not started in this recoverable branch**.
- Crawler Cutover, State/Security, External Plugins, Auth/Browser, HTTP/Observability plans: **not started in this recoverable branch**.

## Git history

```text
f7cc277 feat(source-reader): define plugin capability contract
7aa336e feat(source-reader): define public contracts
93c3c8e chore: import uploaded novel tool source and approved plans
```

A checkpoint documentation commit may appear after the three commits above when this archive is opened.

## Completed work

### Core Runtime Task 1 — Public contracts and stable error model

Created:

```text
apps/api/src/modules/source-reader/public/source-reader.models.ts
apps/api/src/modules/source-reader/public/source-reader.api.ts
apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts
tests/regression/source-reader-public-contract.test.ts
```

Delivered contracts include:

- `SourceCapability`
- request context and reader request models
- normalized metadata/chapter/search/update models
- paged results and versioned extensions
- `SourceReaderApi`
- `SourceReaderError` and stable error codes

Commit: `7aa336e`

### Core Runtime Task 2 — Plugin manifest and capability contract

Created:

```text
apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts
apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts
tests/helpers/source-reader-plugin-contract.ts
tests/regression/source-reader-plugin-contract.test.ts
```

Delivered behavior:

- capability-based plugin methods
- manifest validation with per-capability contract versions
- host/path matcher declarations
- runtime and permission declarations
- plugin method required only when its capability is declared
- shared contract assertion helper for later built-in/external plugins

Commit: `f7cc277`

## In-progress work

### Core Runtime Task 3 — URL matching and per-capability registry

The RED regression test exists at:

```text
tests/regression/source-reader-plugin-registry.test.ts
```

It intentionally fails because this file does not exist yet:

```text
apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts
```

The test currently defines these required behaviors:

1. One domain can be composed from different plugins by capability.
2. Candidates are ordered by descending matcher priority.
3. Include and exclude path patterns are enforced.
4. `www.` and host normalization are handled.
5. Wildcard subdomains such as `*.example.test` are supported.
6. Duplicate plugin IDs are rejected.

Do not delete or weaken this test. Implement the minimum registry code needed to make it pass, then continue the remaining Task 3 steps from the plan.

## Verification state

### Passing completed tests

Command:

```bash
node --import tsx --test \
  tests/regression/source-reader-public-contract.test.ts \
  tests/regression/source-reader-plugin-contract.test.ts
```

Result:

```text
3 tests passed
0 failed
```

Full output: `.checkpoint/completed-tests.log`

### Passing static check

Command:

```bash
npm run build:shared
npm run check -w @novel-tool/api
```

Result: PASS.

Full output: `.checkpoint/static-check.log`

### Expected RED test

Command:

```bash
node --import tsx --test tests/regression/source-reader-plugin-registry.test.ts
```

Expected current result:

```text
ERR_MODULE_NOT_FOUND:
apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts
```

This is the correct TDD stopping point, not an unknown regression.
Full output: `.checkpoint/registry-red-test.log`

### Full verify status

Do **not** expect `npm run test:regression` or `npm run verify` to pass until Task 3 implementation is added, because the intentional RED registry test is included in the regression glob.

## Exact resume instructions

```bash
# 1. Enter the extracted project.
cd novel-tool-v2.9.6-auto-sync

# 2. Confirm the checkpoint state.
git status --short --branch
git log --oneline --decorate -5

# 3. Install dependencies; node_modules is intentionally excluded.
npm install

# 4. Reconfirm completed tests are green.
node --import tsx --test \
  tests/regression/source-reader-public-contract.test.ts \
  tests/regression/source-reader-plugin-contract.test.ts

# 5. Reconfirm Task 3 is RED for the intended reason.
node --import tsx --test tests/regression/source-reader-plugin-registry.test.ts

# 6. Continue Core Runtime Plan, Task 3.
sed -n '767,1027p' \
  docs/superpowers/plans/2026-07-19-source-reader-core-runtime.md
```

First implementation target:

```text
apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts
```

After Task 3 becomes green:

```bash
git add \
  apps/api/src/modules/source-reader/infrastructure/plugins/registry \
  tests/regression/source-reader-plugin-registry.test.ts
git commit -m "feat(source-reader): add capability plugin registry"
```

Then continue in this order:

1. Core Runtime Task 4 — constrained plugin context and in-process runtime.
2. Core Runtime Task 5 — built-in NovelCool plugin.
3. Core Runtime Task 6 — façade, fallback, validation, cursor, streaming and memory cache.
4. `2026-07-19-source-reader-crawler-cutover.md`.
5. `2026-07-19-source-reader-state-security.md`.
6. `2026-07-19-source-reader-external-plugins.md`.
7. `2026-07-19-source-reader-auth-browser.md`.
8. `2026-07-19-source-reader-http-observability-finalization.md`.

## Files intentionally excluded from the archive

- `node_modules/`
- transient build caches

The archive includes `.git/`, so branch history and commits are preserved. It also includes the uncommitted RED test and `.checkpoint/` verification logs.
