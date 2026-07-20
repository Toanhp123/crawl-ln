# Project Build and Documentation Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicate setup/build/check work, add safe cleanup and documentation guards, and reduce the active documentation set to current operational material without changing application behavior.

**Architecture:** Root npm scripts remain the public command surface, while workspace scripts compile or check only their own workspace. A Node-based clean script and documentation consistency script provide cross-platform deterministic maintenance. Historical plans, specs, checkpoints, audits, and release notes are removed from the working tree after current rules are merged into canonical documents; Git history remains the archive.

**Tech Stack:** npm workspaces, Node.js ESM scripts, TypeScript, Prettier, Node test runner, Playwright configuration, Markdown.

## Global Constraints

- Do not change application features, API routes, database schema, Source Reader behavior, frontend design, or plugin parsing.
- Root `build` must compile `@novel-tool/shared` exactly once.
- Workspace `build` and `check` scripts must not recursively invoke sibling workspaces.
- Root convenience commands `build:api`, `build:web`, `check:api`, and `check:web` must work on a clean checkout.
- `verify` must reuse prepared shared/build output for integration tests.
- `clean` must never remove SQLite storage, `.env`, plugin packages, user data, or lockfiles.
- Current docs must not contain retired JSON source-profile instructions outside historical `CHANGELOG.md` entries.
- All deleted documents remain recoverable from Git history.

---

### Task 1: Establish Baseline and Command-Graph Regression Guards

**Files:**
- Create: `tests/regression/project-command-graph.test.ts`
- Modify: `tests/regression/termux-scripts.test.ts`

**Interfaces:**
- Consumes: root/workspace `package.json` scripts.
- Produces: regression assertions for one shared build in root build/check, prepared integration use in verify, canonical Termux alias, and safe clean/docs commands.

- [ ] **Step 1: Write failing command-graph tests** that assert workspace builds/checks are local, root build/check prepare shared once, verify calls `test:integration:prepared`, `termux` is absent, and `clean`/`check:docs` exist.
- [ ] **Step 2: Run the focused tests** with `node --import tsx --test tests/regression/project-command-graph.test.ts tests/regression/termux-scripts.test.ts`; expect failures against current scripts.
- [ ] **Step 3: Record baseline timings** for `npm run check` and `npm run build` after `npm ci`, retaining command output in `/tmp` only.
- [ ] **Step 4: Commit the red tests** with `test: lock project command graph cleanup`.

### Task 2: Simplify Root and Workspace Commands

**Files:**
- Modify: `package.json`
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `build:shared`, `build:api`, `build:web`, `check:api`, `check:web`, `test:integration:prepared`, optimized `build`, `check`, and `verify`.

- [ ] **Step 1: Make API/Web build scripts local**: TypeScript/Vite/copy only, with no root `cd` or shared build.
- [ ] **Step 2: Make API/Web check scripts local**: TypeScript `--noEmit` only.
- [ ] **Step 3: Update root build commands** so root all-workspace build runs shared once and convenience commands prepare shared once.
- [ ] **Step 4: Update root check commands** to run docs/architecture/format/shared checks once, build shared once, then local app checks.
- [ ] **Step 5: Split integration commands** into self-contained `test:integration` and internal `test:integration:prepared`.
- [ ] **Step 6: Reorder verify** to lockfile → check → build → regression → prepared integration.
- [ ] **Step 7: Remove duplicate `termux` alias** and retain `dev:termux`.
- [ ] **Step 8: Run focused command-graph tests** and expect pass.
- [ ] **Step 9: Commit** with `build: remove duplicate workspace preparation`.

### Task 3: Add Safe Cross-Platform Clean Command

**Files:**
- Create: `scripts/clean.mjs`
- Create: `tests/regression/project-clean-command.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run clean`, removing only generated outputs and TypeScript build-info files.

- [ ] **Step 1: Write a failing clean-script test** using a temporary fixture tree containing generated paths plus protected `.env`, SQLite, plugin, and lockfile paths.
- [ ] **Step 2: Verify RED** with `node --import tsx --test tests/regression/project-clean-command.test.ts`.
- [ ] **Step 3: Implement `scripts/clean.mjs`** with `fs.rm`, explicit allowlisted paths, recursive build-info discovery, and idempotent output.
- [ ] **Step 4: Add root `clean` script**.
- [ ] **Step 5: Verify GREEN** and manually run `npm run clean` after creating representative generated outputs.
- [ ] **Step 6: Commit** with `build: add safe cross-platform clean command`.

### Task 4: Add Canonical Documentation Guard

**Files:**
- Create: `scripts/check-docs.mjs`
- Create: `tests/regression/project-docs-check.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run check:docs`, validating canonical links, retired terminology, forbidden historical directories, and duplicate Markdown content.

- [ ] **Step 1: Write failing docs-check tests** for dead links, retired source-profile terminology, historical directories, and duplicate content.
- [ ] **Step 2: Verify RED** against the current repository.
- [ ] **Step 3: Implement Markdown link extraction** for local relative links in root `README.md` and `docs/README.md`.
- [ ] **Step 4: Implement retired-term and forbidden-directory checks**, excluding `CHANGELOG.md` from historical terminology validation.
- [ ] **Step 5: Implement duplicate-content hashing** with an allowlist for intentionally short boilerplate if needed.
- [ ] **Step 6: Add `check:docs` to root `check`**.
- [ ] **Step 7: Keep the focused test red until documentation cleanup is complete**.
- [ ] **Step 8: Commit script and test** with `test: guard canonical project documentation`.

### Task 5: Consolidate Canonical Documentation

**Files:**
- Create: `docs/README.md`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SOURCE_READER.md`
- Modify: `docs/E2E_TEST_CHECKLIST.md`
- Modify: `docs/backend/BE_ARCHITECTURE_RULES.md`
- Modify: `docs/frontend/FSD.md`
- Modify: `docs/frontend/SETTINGS_CAPABILITY_MATRIX.md`
- Review/retain: `docs/frontend/DESIGN_SYSTEM_V2.md`
- Review/retain: `docs/frontend/FE_BACKEND_CONTRACT_SYNC.md`
- Review/retain: `docs/frontend/MOBILE_UX_ACCEPTANCE.md`
- Review/retain: `docs/frontend/PERFORMANCE_BASELINE.md`
- Review/retain: `docs/frontend/UI_STATE_MATRIX.md`

**Interfaces:**
- Produces: a small current documentation set with valid links and current Source Reader terminology.

- [ ] **Step 1: Rewrite README setup and command sections** for `npm ci`, `npm run dev`, `npm run clean`, `npm run check`, `npm run build`, `npm run verify`, and Termux.
- [ ] **Step 2: Create docs index** listing only canonical docs and Git-history retrieval commands.
- [ ] **Step 3: Merge still-current backend rules** from review/clean-architecture docs into `BE_ARCHITECTURE_RULES.md` without historical status prose.
- [ ] **Step 4: Merge useful FSD rules** into `docs/frontend/FSD.md` and remove audit/result language.
- [ ] **Step 5: Update architecture, Source Reader, E2E, and settings docs** to current plugin/server-managed terminology.
- [ ] **Step 6: Scan canonical docs** for dead links and retired terminology.
- [ ] **Step 7: Commit** with `docs: consolidate current project guidance`.

### Task 6: Remove Historical and Duplicate Documentation

**Files:**
- Delete: `docs/superpowers/**`
- Delete: `docs/archive/**`
- Delete: `docs/changelog/**`
- Delete: completed backend review/upgrade/done reports except canonical rules.
- Delete: completed frontend audit/final-review/mobile-pass/fix reports except canonical docs.
- Delete: `BE_PRAGMATIC_CLEAN_REVIEW.md`
- Delete: `CHECKPOINT-PROGRESS.md`
- Delete: `UX_PHASE3_NOTES.md`
- Delete: obsolete root/docs milestone, cleanup, and old-review files.
- Modify: `tests/regression/source-reader-final-lockdown.test.ts`
- Modify: any other tests found to require historical docs.

**Interfaces:**
- Produces: no historical docs directories and production-code-focused regression tests.

- [ ] **Step 1: Update tests** to assert production security/runtime boundaries instead of historical spec-file presence.
- [ ] **Step 2: Delete duplicate and historical files** exactly as classified in the approved design.
- [ ] **Step 3: Run `npm run check:docs`** and fix every reported canonical-link, duplicate, or terminology issue.
- [ ] **Step 4: Run focused architecture/security tests** affected by deleted docs.
- [ ] **Step 5: Commit** with `docs: remove completed project history from working tree`.

### Task 7: Audit Dependencies and Generated Artifacts

**Files:**
- Modify only when evidence proves removal: root/workspace `package.json`, `package-lock.json`.
- Update: `docs/frontend/PERFORMANCE_BASELINE.md` with command graph and before/after measurements.

**Interfaces:**
- Produces: documented dependency audit and no speculative removals.

- [ ] **Step 1: Enumerate every direct dependency** and search source, tests, scripts, config, CLI usage, and dynamic imports.
- [ ] **Step 2: Identify conclusive unused candidates**; if none, record that result and leave lockfile unchanged.
- [ ] **Step 3: For each conclusive candidate, remove one at a time** and run lockfile/static/regression/integration/build gates before retaining removal.
- [ ] **Step 4: Inspect generated/untracked paths and `.gitignore`**; add only missing safe ignores.
- [ ] **Step 5: Record structural and wall-clock before/after results** in the performance baseline.
- [ ] **Step 6: Commit** with `chore: complete dependency and artifact audit` if changes exist, otherwise fold the documentation update into the final verification commit.

### Task 8: Full Verification and Delivery

**Files:**
- Modify: `CHANGELOG.md` with a concise unreleased cleanup note if the project convention supports it.

**Interfaces:**
- Produces: verified clean repository and distributable ZIP preserving Git history.

- [ ] **Step 1: Run `npm ci` from the cleaned repository**.
- [ ] **Step 2: Run `npm run clean` and confirm protected runtime paths remain**.
- [ ] **Step 3: Run `npm run check:lockfile`, `npm run check`, and `npm run build`**.
- [ ] **Step 4: Run all regression tests**, sharding only if the single runner exceeds the environment limit.
- [ ] **Step 5: Run all integration tests**, sharding only for infrastructure stability.
- [ ] **Step 6: Run `npm run verify` or document the exact environment limit if the one-shot process cannot complete despite all constituent gates passing.
- [ ] **Step 7: Compare before/after timings and command logs**, proving shared compilation counts structurally.
- [ ] **Step 8: Run `git diff --check`, `git fsck --full`, and confirm clean working tree after commit.
- [ ] **Step 9: Package a ZIP without dependencies, runtime storage, coverage, Playwright output, or build output; restore it and verify branch/HEAD/integrity.
- [ ] **Step 10: Commit final verification record** with `chore: verify project cleanup`.
