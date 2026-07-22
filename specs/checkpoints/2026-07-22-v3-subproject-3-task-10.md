# Novel Tool V3 Subproject 3 Task 10 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Tasks 1 through 9: complete.
- Subproject 3, Task 10, Extract the Pure `reader-engine` Package: complete.
- Task 9 checkpoint commit: `c6eec6f` (`docs: checkpoint v3 subproject 3 task 9`).
- Task 10 implementation commit: `b1a4b30` (`feat: extract pure reader engine`).
- Working branch: `feat/v3-reader-engine`.
- No Task 11 web reader adapter work has been started.

## Completed Scope

- Added package `@novel-tool/reader-engine` with root-only public exports, `sideEffects: false`, declaration output, and package-local `build`, `check`, and `test` commands.
- Added the locked platform-neutral contracts for chapter identities, memory/persistent caches, chapter loaders, chapter sources, snapshots, session options, and session controls.
- Added `MemoryReaderChapterCache` with content-version validation and bounded LRU eviction.
- Added `ReaderChapterSource` with memory -> persistent cache -> loader ordering, stale chapter-ID rejection, abort checks, and cache writes only after an active load.
- Added immutable reader-window creation, prepend/append deduplication, active-centered bounded eviction, and active-window focusing.
- Added `createReaderSession` with generation-scoped cancellation, initial/previous/next loading, active-index state, retry, subscriptions, adjacent prefetch, in-flight load deduplication, and bounded chapter windows.
- Added package tests covering window bounds, LRU behavior, cache ordering, stale identity rejection, cancellation, session replacement, adjacent loading deduplication, retry, and subscriptions.
- Added a TypeScript-AST purity checker for framework imports, app/shared imports, dynamic imports, import types, `require`, and forbidden browser identifiers.
- Added architecture regression fixtures proving clean package acceptance and forbidden import/browser-global rejection.
- Added `prepare-reader-engine.mjs` and integrated reader-engine emission into `prepare:packages`, prepared checks, and the prepared build graph.
- Added root reader-engine lifecycle scripts and portable workspace lockfile entries.

## Locked Decisions

- `packages/reader-engine` imports no React, React DOM, router, app code, browser storage, browser globals, HTTP transport type, or `@novel-tool/shared` type.
- The package consumes only the locked generic contracts and the platform-neutral `AbortSignal` cancellation contract.
- Browser persistence remains injectable through `ReaderChapterCache`; IndexedDB implementation belongs to Task 11 under `apps/web-next/features/read-chapter`.
- Transport chapter mapping remains outside the package; Task 11 adapts the chapter entity public API to `ReaderChapterLoader`.
- Memory cache keys use novel ID plus chapter ID, while content version controls validity.
- Loaded chapter IDs must equal the selected identity ID; mismatch raises `StaleChapterListError`.
- Session replacement aborts the prior generation and stale completions cannot update the current snapshot.
- Prefetch and foreground loads share an in-flight key of novel ID, chapter ID, and content version to prevent duplicate loader calls.
- Reader windows retain the active chapter and never exceed the configured positive integer limit.
- Package public exports remain limited to the root `dist/index.js` and `dist/index.d.ts` entrypoint.
- Task 11 remains untouched.

## RED -> GREEN Evidence

The first Task 10 run failed all four test files because `packages/reader-engine/src`, package metadata, and `scripts/check-reader-engine-architecture.mjs` did not exist.

The initial GREEN implementation passed window, chapter-source, and purity behavior but exposed two real defects:

- local variables named `window` violated the locked browser-identifier purity rule;
- prefetch and foreground loading could race and call the loader twice for the same chapter.

The implementation renamed the reader state to `chapterWindow` without weakening the checker and added in-flight load deduplication keyed by novel ID, chapter ID, and content version. Focused engine and purity tests then passed 10/10.

A later TypeScript pass caught one stale two-argument `prefetch` call after refactoring the generation parameter. That call was corrected and the full gate was rerun from the beginning.

## Fresh Verification

The following checks completed successfully after the final source change and formatting:

```powershell
node --experimental-sqlite --loader /tmp/task10-ts-loader.mjs --test tests/regression/web-next-scaffold.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-core-entities.test.ts tests/regression/web-next-source-reader-entities.test.ts tests/regression/web-next-library-task-features.test.ts tests/regression/web-next-settings-data-features.test.ts tests/regression/web-next-source-reader-features.test.ts tests/regression/web-next-realtime-routing.test.ts tests/regression/reader-engine-architecture.test.ts tests/regression/source-reader-web-console-contract.test.ts tests/regression/source-reader-web-contract.test.ts packages/reader-engine/tests/*.test.ts
npm run check -w @novel-tool/reader-engine
npm run check:reader-engine-arch
npm run prepare:packages
npm run check:web-next-arch
npm run check:web-next
npm run check:web-contracts
npm run check:lockfile
npm run build:reader-engine
node scripts/check-prepared.mjs --skip-typescript
prettier --check packages/reader-engine scripts/prepare-reader-engine.mjs scripts/check-reader-engine-architecture.mjs scripts/prepare-packages.mjs scripts/check-prepared.mjs scripts/build-prepared.mjs tests/regression/reader-engine-architecture.test.ts package.json
git diff --check
```

Recorded results:

- Task 1-10 frontend, engine, and Source Reader security/contract tests: 66 pass, 0 fail.
- Reader-engine TypeScript check: pass.
- Reader-engine architecture check: pass.
- Reader-engine preparation and declaration/JavaScript emission: pass.
- Required public dist exports (`MemoryReaderChapterCache`, `ReaderChapterSource`, `createReaderWindow`, `createReaderSession`): pass.
- Real `apps/web-next` architecture check: pass.
- `web-next` TypeScript check: pass.
- Frozen frontend contract check: pass.
- Prepared architecture, documentation, and formatting checks: pass.
- Lockfile portability: pass.
- Whitespace/error-marker check: pass.

The clean checkpoint ZIP does not contain `node_modules`. A full Linux `npm ci` could not complete within the execution environment. The available dependency tree originated on Windows, so the exact package test command using `tsx` and the Vite production build could not load Linux-native esbuild/Rolldown binaries. The same TypeScript package tests were executed through a temporary TypeScript loader and passed 10/10. `npm run build:reader-engine` completed successfully because reader-engine emission uses the TypeScript compiler directly.

`npm run build:web-next` completed its TypeScript stage and then stopped during Vite startup because `@rolldown/binding-linux-x64-gnu` was unavailable. This is the same environment limitation recorded at Tasks 7-9, not a reader-engine source or type failure. Rerun the exact `npm run test -w @novel-tool/reader-engine` and frontend production builds after a normal Linux `npm ci` with registry access.

The full repository regression and integration suites were not rerun for this isolated frontend reader-engine extraction task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 11, Build Web Reader Adapters and Reader Features.

Do not begin Task 12 before Task 11 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
