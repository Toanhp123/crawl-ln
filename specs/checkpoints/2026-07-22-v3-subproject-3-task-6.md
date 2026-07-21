# Novel Tool V3 Subproject 3 Task 6 Checkpoint

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
- Task 5 checkpoint commit: `e9bba6a` (`docs: checkpoint v3 subproject 3 task 5`).
- Task 6 implementation commit: `fe609d9` (`feat: add v3 library and task actions`).
- Working branch: `feat/v3-web-next-library-task-features`.
- No known blocker remains for Subproject 3, Task 7.

## Completed Scope

- Added the `add-novel` feature with:
  - strict HTTP/HTTPS URL normalization and validation;
  - `/api/novels/analyze` followed by `/api/crawl/jobs` sequencing;
  - a pure `createAddNovelWorkflow` with injectable analyze/crawl dependencies;
  - novel/task invalidation through entity-owned invalidation adapters;
  - `AddNovelProvider`, `useAddNovelOverlay`, and `AddNovelOverlay`;
  - clipboard trimming, pending-close protection, reset behavior, toast feedback, and English/Vietnamese catalogs.
- Added the standalone `crawl-novel` feature with its POST client, mutation hook, task invalidation, toast feedback, and reusable button.
- Added the `update-novel` feature with the frozen update endpoint, novel/task invalidation, result-sensitive feedback, and reusable button.
- Added the `delete-novel` feature with strict 204 handling, novel/task invalidation, optional post-delete callback, and reusable danger button.
- Added narrow `pause-task`, `resume-task`, and `cancel-task` features with:
  - their frozen HTTP methods and endpoints;
  - feature-owned TanStack mutations;
  - detail, novel-task, and task-root invalidation;
  - reusable action buttons and localized feedback.
- Added regression coverage for workflow order, URL/clipboard behavior, pending-close policy, HTTP mutation contracts, public feature APIs, invalidation roots, and mutation ownership boundaries.

## Locked Decisions

- `add-novel` owns analyze-then-crawl orchestration. It does not import `crawl-novel`, because same-layer feature slices cannot cross-import.
- The add workflow calls `/api/novels/analyze`, which persists/updates the analyzed novel, then creates the crawl job using the returned novel ID.
- All seven mutations remain feature-owned. `entities` remain GET-only, while `app` and `pages` remain orchestration/rendering layers without direct mutations.
- Feature code consumes `novelInvalidation` and `taskInvalidation` only through entity public indexes; it does not reach entity internals or recreate query-key ownership.
- Task pause, resume, and cancel success handlers invalidate task detail, the novel-specific task, and the complete task root.
- Add-novel overlay state remains feature-local until the app-shell migration task composes the provider and overlay.
- Feature English/Vietnamese catalogs are exported but are not composed into the application catalog until the app-provider/catalog composition work.
- Delete confirmation remains a caller/page composition concern; the feature exposes a reusable danger action and mutation hook without placing confirmation policy in an entity.
- No Task 7 scheduler/search/export/backup/settings feature has been started.

## RED -> GREEN Evidence

The first Task 6 regression run reported 4 failures because all seven feature slices and their public APIs were missing.

The GREEN implementation added the add-novel workflow and overlay plus crawl, update, delete, pause, resume, and cancel action slices. The focused Task 6 test then passed 4/4.

A separate RED -> GREEN review added and verified clipboard trimming, feature toast catalog copy, and the pure pending-close guard used by the overlay.

## Fresh Verification

The following commands completed successfully from dependencies restored with `npm ci --ignore-scripts` using the checkpoint lockfile:

```powershell
node --import tsx --test tests/regression/web-next-library-task-features.test.ts tests/regression/web-next-source-reader-entities.test.ts tests/regression/web-next-core-entities.test.ts tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-scaffold.test.ts
npm run check:web-next-arch
npm run check:web-next
npm run check:web-contracts
npm run build:web-next
npm run build:web
npm run check:lockfile
npx prettier --check apps/web-next/src/features tests/regression/web-next-library-task-features.test.ts
git diff --check
```

Recorded results:

- Task 1-6 frontend regression tests: 34 pass, 0 fail.
- Real `apps/web-next` architecture check: pass.
- `web-next` TypeScript check: pass.
- Frozen frontend contract check: pass.
- `web-next` production build: pass with Vite `8.1.4`.
- Current `apps/web` production build: pass with Vite `8.1.4`.
- Lockfile portability: pass.
- Targeted formatting check: pass.
- Whitespace/error-marker check: pass.

The full repository regression and integration suites were not rerun for this frontend feature-ownership task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 7, implement Scheduler, Search, Export, Backup, and Settings features.

Do not begin Task 8 before Task 7 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
