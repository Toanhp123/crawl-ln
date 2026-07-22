# Novel Tool V3 Subproject 3 Task 11 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Tasks 1 through 10: complete.
- Subproject 3, Task 11, Build Web Reader Adapters and Reader Features: complete.
- Task 10 checkpoint commit: `0a0c1de` (`docs: checkpoint v3 subproject 3 task 10`).
- Task 11 implementation commit: `e90164b` (`feat: add v3 reader adapters`).
- Working branch: `feat/v3-web-next-reader-adapters`.
- No Task 12 app-shell, provider, router, or navigation work has been started.

## Completed Scope

- Added `@novel-tool/reader-engine` as an explicit `apps/web-next` workspace dependency.
- Added a chapter loader adapter that consumes only the chapter entity public `getChapter` API and maps transport chapters into reader-engine values.
- Added `IndexedDbReaderChapterCache` with database version 4, content-version validation, bounded LRU pruning, and quota retry after pruning to 75 percent capacity.
- Added reading-anchor capture and restore helpers without moving DOM behavior into the pure reader-engine package.
- Added versioned reading-position storage with legacy V1/V2 migration, validation, and corruption fallback.
- Added browser-local continuity storage for history, bookmarks, and read-chapter state with change subscriptions.
- Added `useReaderController`, which owns React lifecycle and browser online/offline state while delegating loading, cancellation, retry, adjacent prefetch, and bounded windows to `reader-engine`.
- Added reader progress and swipe/keyboard chapter-navigation hooks.
- Added a reusable offline reader banner.
- Added reader preferences normalization, storage, DOM application, provider, settings sheet, and feature-owned reader theme CSS.
- Added chapter selection sheet behavior and English/Vietnamese catalogs for all three Task 11 feature slices.
- Added root-only public indexes for `read-chapter`, `reader-preferences`, and `select-chapter`.
- Added Task 11 regression coverage for adapter ownership, browser persistence, cache behavior, reader preferences, CSS ownership, public exports, and workspace dependency wiring.

## Locked Decisions

- `packages/reader-engine` remains pure and receives browser persistence only through the injected cache contract.
- HTTP access remains in the chapter entity; `read-chapter` adapts its public API and owns no direct transport client.
- IndexedDB, localStorage, DOM anchors, online/offline state, keyboard input, swipe gestures, and React lifecycle remain in Web Next feature adapters.
- Reader controller navigation is callback-driven and imports no router.
- Reader continuity and preference storage failures are best-effort and never block chapter reading.
- Persistent chapter entries are valid only when novel ID, chapter ID, and content version match the requested identity.
- Reader preference storage is normalized before use; invalid enum values, malformed JSON, non-finite brightness, and out-of-range brightness fall back or clamp safely.
- Reader visual state is owned by `features/reader-preferences`, including every `data-reader-*` attribute and reader-specific CSS variable/selector.
- Theme attributes applied to the document root affect descendant `.reader-surface` elements.
- Task 12 remains untouched.

## RED -> GREEN Evidence

The first Task 11 regression run failed all eight initial tests because the three feature slices, browser adapters, reader preferences CSS, and Web Next reader-engine dependency did not exist.

The initial GREEN implementation exposed a real TypeScript issue in legacy reading-position migration: intersecting the V2 shape with a V1/V2 version union narrowed the version field incorrectly. The migration input was replaced with a standalone legacy type rather than weakening the compiler.

Compiler and architecture verification then passed. Self-review added two edge-case assertions before completion:

- non-finite brightness such as `NaN` must normalize to 100;
- reader theme CSS must support a `data-reader-theme` attribute applied to the document root, not only an attribute placed directly on the reader surface.

Both new assertions failed first, then passed after finite-number validation and root-descendant theme selectors were implemented. The focused Task 11 suite finished with 9/9 passing tests.

## Fresh Verification

The following checks completed after the final source change and formatting:

```powershell
node --experimental-sqlite --loader /tmp/task11-ts-loader.mjs --test tests/regression/web-next-scaffold.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-core-entities.test.ts tests/regression/web-next-source-reader-entities.test.ts tests/regression/web-next-library-task-features.test.ts tests/regression/web-next-settings-data-features.test.ts tests/regression/web-next-source-reader-features.test.ts tests/regression/web-next-realtime-routing.test.ts tests/regression/web-next-reader-adapters.test.ts tests/regression/reader-engine-architecture.test.ts tests/regression/source-reader-web-console-contract.test.ts tests/regression/source-reader-web-contract.test.ts packages/reader-engine/tests/*.test.ts
npm run check -w @novel-tool/reader-engine
npm run check:reader-engine-arch
npm run prepare:packages
npm run check:web-next-arch
npm run check:web-next
npm run check:web-contracts
npm run check:lockfile
npm run build:reader-engine
node scripts/check-prepared.mjs --skip-typescript
prettier --check apps/web-next/package.json apps/web-next/src/features/read-chapter apps/web-next/src/features/reader-preferences apps/web-next/src/features/select-chapter tests/regression/web-next-reader-adapters.test.ts package-lock.json
git diff --check
```

Recorded results:

- Task 1-11 frontend, reader-engine, and Source Reader security/contract tests: 75 pass, 0 fail.
- Task 11 focused adapter tests: 9 pass, 0 fail.
- Reader-engine TypeScript and purity checks: pass.
- Reader-engine package preparation and build: pass.
- Real `apps/web-next` architecture check: pass.
- `web-next` TypeScript check: pass.
- Frozen frontend contract check: pass.
- Prepared architecture, documentation, and formatting checks: pass.
- Lockfile portability: pass.
- Whitespace/error-marker check: pass.

The clean checkpoint ZIP does not contain `node_modules`. The available verification dependency tree originated on Windows. `npm run build:web-next` completed its TypeScript stage but the Vite shim was not executable on Linux. Running Vite's JavaScript entrypoint directly confirmed the underlying missing optional native dependency: `@rolldown/binding-linux-x64-gnu`.

This is an execution-environment dependency limitation rather than a Task 11 source or type failure. Rerun the production frontend build after a normal Linux `npm ci` with registry access.

The full repository regression and integration suites were not rerun for this isolated frontend reader-adapter task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 12, Port the App Shell, Providers, Router, and Navigation.

Do not begin Task 13 before Task 12 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
