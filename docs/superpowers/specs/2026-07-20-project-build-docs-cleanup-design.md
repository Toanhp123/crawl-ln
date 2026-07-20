# Project Build and Documentation Cleanup Design

## Goal

Reduce setup, check, verification, and build duplication while removing completed or obsolete planning/review documentation from the working tree. Preserve current runtime behavior, architecture guards, test coverage, CI behavior, and all historical material in Git history.

## Scope

This cleanup covers:

1. Root and workspace npm scripts.
2. Generated build/test artifacts and an explicit cross-platform clean command.
3. Setup and verification documentation.
4. Dependency usage verification without speculative package removal.
5. Markdown documentation consolidation and deletion of completed historical material.
6. Regression guards that currently depend on historical plan/spec files.

This cleanup does not change application features, API routes, database schema, Source Reader behavior, frontend design, or plugin parsing behavior.

## Current Problems

### Command duplication

- Root `npm run build` invokes the shared build directly and then both app workspace builds invoke it again, compiling `@novel-tool/shared` three times.
- Root `npm run check` checks shared once, builds it once, and then each app workspace check repeats the shared check.
- `npm run verify` runs integration setup and production build as separate phases, causing another shared compilation.
- `termux` and `dev:termux` are identical aliases.
- There is no canonical cross-platform command to remove `dist`, Playwright output, coverage, and transient test output.

### Documentation drift

- The repository contains 143 Markdown files totaling approximately 953 KiB.
- Completed plans, specs, checkpoints, audits, milestone notes, and historical UI upgrade documents remain in the active working tree.
- Several current documents still mention removed JSON source profiles and obsolete crawler selector adapters.
- Root `BE_PRAGMATIC_CLEAN_REVIEW.md` duplicates `docs/backend/BE_PRAGMATIC_CLEAN_REVIEW.md` byte-for-byte.
- README setup examples use an old archive version and link to missing or historical documentation.

## Command Architecture

The root `package.json` remains the public command surface. Workspace commands become local to their workspace and must not recursively build or check sibling workspaces.

### Build commands

- `build:shared` builds `@novel-tool/shared` once.
- `build` runs `build:shared`, then local API and Web builds.
- `build:api` is a self-contained convenience command that builds shared and then API.
- `build:web` is a self-contained convenience command that builds shared and then Web.
- `apps/api` and `apps/web` `build` scripts compile only their own workspace.

The root all-workspace build therefore compiles shared exactly once. Direct root convenience commands remain safe on a clean checkout.

### Check commands

- `check` runs architecture guards, web contract guards, formatting, shared type-check, one shared build, then local API and Web type-checks.
- `check:api` and `check:web` are self-contained root convenience commands that prepare shared first.
- App workspace `check` scripts only type-check their own source.

The shared build remains in the full check because both applications resolve `@novel-tool/shared` through its emitted `dist` declarations.

### Verification commands

`verify` uses this order:

1. lockfile portability check;
2. complete static check;
3. production build;
4. regression tests;
5. integration tests using the already prepared shared build.

`test:integration` remains self-contained for developers and builds shared first. A separate internal `test:integration:prepared` command runs the test process without rebuilding shared and is used by `verify`.

### Development commands

`dev`, `dev:api`, and `dev:web` continue to prepare shared before starting Vite or the API watcher. The duplicate `termux` alias is removed; `dev:termux` is the canonical Termux development command.

### Clean command

Add `scripts/clean.mjs` using Node filesystem APIs so it works on Linux, macOS, CI, and Termux. It removes only generated paths:

- `packages/shared/dist`;
- `apps/api/dist`;
- `apps/web/dist`;
- `coverage`;
- `playwright-report`;
- `test-results`;
- `.nyc_output`;
- TypeScript build-info files.

It must not remove SQLite storage, `.env`, plugin packages, user data, or lockfiles.

## Dependency Audit Policy

No dependency is removed solely because a static tool labels it unused. For each candidate package:

1. search source, scripts, tests, configuration, and dynamic imports;
2. inspect package scripts and CLI invocation;
3. remove one package at a time;
4. run lockfile check, static checks, regression, integration, and build;
5. restore the package if any runtime or tooling path depends on it.

The cleanup may update the lockfile only when a package is conclusively unused. Version upgrades are outside this scope.

## Documentation Architecture

The active repository retains only current, actionable documentation.

### Canonical root documents

- `README.md`: setup, commands, runtime requirements, route overview, and links to canonical docs.
- `CHANGELOG.md`: historical release record. Historical entries may mention retired functionality because they describe old releases.

Delete root checkpoint, review, and phase-note files after migrating any still-current information.

### Canonical `docs` documents

- `docs/README.md`: documentation index and explanation that completed design history is available through Git.
- `docs/ARCHITECTURE.md`: current system/module overview.
- `docs/SOURCE_READER.md`: current Source Reader operations and plugin authoring.
- `docs/E2E_TEST_CHECKLIST.md`: current browser acceptance checklist using Source Reader terminology.
- `docs/backend/BE_ARCHITECTURE_RULES.md`: canonical backend dependency and module rules, merged with any still-current rules from older clean-architecture documents.
- `docs/frontend/FSD.md`: canonical FSD structure and rules, merged with `FSD_RULES.md` where useful.
- `docs/frontend/DESIGN_SYSTEM_V2.md`: canonical token/component/motion policy.
- `docs/frontend/FE_BACKEND_CONTRACT_SYNC.md`: current HTTP contract baseline.
- `docs/frontend/MOBILE_UX_ACCEPTANCE.md`: current viewport and mobile acceptance matrix.
- `docs/frontend/PERFORMANCE_BASELINE.md`: current performance policy and command expectations.
- `docs/frontend/SETTINGS_CAPABILITY_MATRIX.md`: updated to Source Reader/server-managed terminology.
- `docs/frontend/UI_STATE_MATRIX.md`: current screen-state expectations.
- App-local `shared/theme` and `shared/ui` README/style guide files remain because they document code owned by those directories.

### Historical documentation removed from the working tree

Delete:

- `docs/superpowers/**` after this cleanup's design/plan have been implemented and committed;
- `docs/archive/**`;
- completed backend review, hardening, upgrade, and “done” reports after current rules are merged;
- frontend audit, final-review, mobile-pass, and one-off fix reports after current rules are merged;
- `docs/changelog/**` after confirming the root changelog is canonical;
- milestone, cleanup-review, old-review, and phase-note files;
- duplicate root/backend review files;
- Source Reader checkpoints and roadmap documents;
- obsolete references to JSON source profiles or selector-profile configuration in current docs and UI copy.

Git retains every deleted file and allows retrieval with `git log --all -- <path>` or `git show <commit>:<path>`.

## Test and Guard Updates

Tests must not require historical plans, specs, or checkpoints to exist. Architecture/security tests should validate production code, configuration, and canonical operational docs only.

Add a documentation consistency check that validates:

- every Markdown path linked from `README.md` and `docs/README.md` exists;
- no current documentation outside `CHANGELOG.md` uses retired source-profile terminology;
- no historical directories (`docs/superpowers`, `docs/archive`, `docs/changelog`) return after cleanup;
- duplicate Markdown content is not introduced.

This check runs as `check:docs` inside `npm run check`.

## Setup Documentation

README uses the current version and recommends:

- `npm ci` for a reproducible clean checkout or CI;
- `npm install` only for intentional dependency changes;
- `npm run setup:termux` on Termux;
- `npm run dev` for normal development;
- `npm run clean` before diagnosing stale generated output, not before every build.

The build must not automatically clean because unconditional cleaning removes useful generated output and makes repeated local builds slower.

## Performance Measurement

Record before/after wall-clock measurements for these commands on the same workspace after dependencies are installed:

- `npm run check`;
- `npm run build`;
- `npm run verify` or its individual phases when the environment timeout prevents one-shot completion.

The acceptance target is structural rather than a fragile fixed percentage:

- shared compiles once during root build;
- shared checks once and compiles once during root check;
- verify does not rebuild shared during integration after production build;
- no application code or test behavior changes.

## Acceptance Criteria

1. A clean `npm ci` checkout can run `npm run dev`, `npm run check`, `npm run build`, and `npm run verify` using documented commands.
2. Root build compiles shared once.
3. Root check does not recursively repeat shared type-checks through app scripts.
4. Root verify reuses prepared build output for integration.
5. `npm run clean` removes generated output without touching user/runtime data.
6. All current README/doc links resolve.
7. Current docs contain no obsolete source-profile instructions.
8. Historical plan/spec/checkpoint/archive directories are absent from the final working tree.
9. Canonical architecture, Source Reader, FSD, design-system, contract, mobile, performance, and state documents remain.
10. Architecture guards, formatting, TypeScript, regression, integration, and production build pass after cleanup.
11. Git working tree and object database are clean before packaging.
