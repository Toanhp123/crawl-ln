# Novel Tool V3 Subproject 3 Task 7 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Task 1, Scaffold the Parallel `web-next` Runtime: complete.
- Subproject 3, Task 2, Add the Strict TypeScript-AST FSD Guard: complete.
- Subproject 3, Task 3, Port the Domain-Free Shared Platform and Visual Foundation: complete.
- Subproject 3, Task 4, Build Library, Chapter, Task, Scheduler, and Search Entities: complete.
- Subproject 3, Task 5, Build Source Reader Entity Query Slices: complete.
- Subproject 3, Task 6, Implement Library and Task Action Features: complete.
- Subproject 3, Task 7, Implement Scheduler, Search, Export, Backup, and Settings Features: complete.
- Task 6 checkpoint commit: `28b916a` (`docs: checkpoint v3 subproject 3 task 6`).
- Task 7 implementation commit: `8a809eb` (`feat: add v3 settings and data actions`).
- Working branch: `feat/v3-web-next-settings-data-features`.
- No Task 8 Source Reader administration feature has been started.

## Completed Scope

- Added `update-auto-update` with the frozen novel auto-update endpoint, novel/scheduler invalidation, localized feedback, and a reusable interval control.
- Added `run-scheduler` with the frozen scheduler tick endpoint, scheduler/novel/task invalidation, localized feedback, and a reusable action button.
- Added `search-library` as feature-owned query input, type filtering, paging, result selection, and UI orchestration over the public search entity query.
- Added `rebuild-search-index` with the frozen rebuild endpoint, search invalidation, localized feedback, and a reusable action button.
- Added one generic `DownloadArtifact` contract and shared binary helpers that preserve content-disposition filenames, content type, byte content, HTTP error envelopes, and invalid 204/empty-body semantics.
- Added `export-novel` with the frozen binary export endpoint, EPUB/TXT options, downloaded-only and range inputs, artifact saving, localized feedback, and reusable controls.
- Added `backup-library` with:
  - binary backup creation and filename preservation;
  - replace/merge restore modes;
  - keep-current/use-backup settings modes;
  - password and current-settings headers;
  - restore response validation;
  - confirmation, replace danger styling, pending action state, maintenance feedback, settings application, and full query invalidation.
- Added `configure-appearance` and `configure-language` wrappers over generic shared provider commands, with reusable controls and no direct storage or document mutation.
- Added English and Vietnamese catalogs for all eight feature slices.
- Added regression coverage for frozen mutation endpoints, binary artifact semantics, backup settings/validation, public feature APIs, provider/query consumption, and FSD ownership boundaries.

## Locked Decisions

- Scheduler, rebuild, export, backup, and auto-update writes remain feature-owned. `entities` remain read-only, and `app`/`pages` do not own these mutations.
- `search-library` owns search input/result orchestration but consumes `useLibrarySearch` through the search entity public index; it does not import TanStack Query directly.
- `rebuild-search-index` owns POST `/api/search/rebuild` and invalidates the search entity root after success.
- Export and backup use the same generic `DownloadArtifact` contract. HTTP 204 or an empty successful binary response is an error, not a successful empty file.
- Backup restore remains inside the feature, including confirmation, password handling, replace/merge policy, maintenance feedback, response validation, and applying restored generic settings.
- Backup settings include only generic application settings. Reader-owned preferences remain outside `shared` and will be integrated with the reader package/adapters in later tasks.
- Appearance and language features only wrap commands exposed by generic shared providers; they do not write `localStorage` or manipulate the document root directly.
- Feature catalogs are exported but are not composed into the application catalog until the app-shell/provider composition task.
- No Task 8 Source Reader administration code has been created.

## RED -> GREEN Evidence

The first Task 7 regression run reported 6 failures because all eight feature slices and the generic binary helper were missing.

The GREEN implementation added the scheduler, search, export, backup, appearance, and language feature slices. The focused Task 7 contract test then passed 6/6.

A separate RED -> GREEN review locked restore confirmation pending state and replace-mode danger styling before the final verification run.

## Fresh Verification

The following required Task 7 checks completed successfully:

```powershell
node --loader /tmp/ts-loader.mjs --test tests/regression/web-next-settings-data-features.test.ts tests/regression/web-next-library-task-features.test.ts tests/regression/web-next-source-reader-entities.test.ts tests/regression/web-next-core-entities.test.ts tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-scaffold.test.ts
npm run check:web-next-arch
npm run check:web-next
npm run check:web-contracts
npm run check:lockfile
npx prettier --check apps/web-next/src/shared/api/index.ts apps/web-next/src/shared/api/download.ts apps/web-next/src/features/update-auto-update apps/web-next/src/features/run-scheduler apps/web-next/src/features/search-library apps/web-next/src/features/rebuild-search-index apps/web-next/src/features/export-novel apps/web-next/src/features/backup-library apps/web-next/src/features/configure-appearance apps/web-next/src/features/configure-language tests/regression/web-next-settings-data-features.test.ts
git diff --check
```

Recorded results:

- Task 1-7 frontend regression tests: 40 pass, 0 fail.
- Real `apps/web-next` architecture check: pass.
- `web-next` TypeScript check: pass.
- Frozen frontend contract check: pass.
- Lockfile portability: pass.
- Targeted formatting check: pass.
- Whitespace/error-marker check: pass.

The clean checkpoint ZIP does not contain `node_modules`. During this session the configured npm registry returned HTTP 503, so Linux-native optional dependencies could not be restored. The available dependency tree came from the Windows source ZIP. Consequently:

- the exact `node --import tsx` runner was blocked by the Windows `esbuild` binary;
- `vite build` was blocked by the missing Linux Rolldown native binding;
- a temporary untracked TypeScript compiler loader was used only to execute the same Node test files on Linux;
- TypeScript compilation itself completed successfully through `npm run check:web-next`.

No production code, lockfile, or checkpoint artifact depends on that temporary loader. Production builds should be rerun after a normal Linux `npm ci` when the registry is available.

The full repository regression and integration suites were not rerun for this frontend feature-ownership task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 8, implement Source Reader administration features.

Do not begin Task 9 before Task 8 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
