# Novel Tool V3 Subproject 3 Task 4 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Task 1, Scaffold the Parallel `web-next` Runtime: complete.
- Subproject 3, Task 2, Add the Strict TypeScript-AST FSD Guard: complete.
- Subproject 3, Task 3, Port the Domain-Free Shared Platform and Visual Foundation: complete.
- Subproject 3, Task 4, Build Library, Chapter, Task, Scheduler, and Search Entities: complete.
- Task 3 checkpoint commit: `3ce3da2` (`docs: checkpoint v3 subproject 3 task 3`).
- Task 4 implementation commit: `89d0f8f` (`feat: add v3 core entity queries`).
- Working branch: `feat/v3-web-next-core-entities`.
- No known blocker remains for Subproject 3, Task 5.

## Completed Scope

- Added the read-only `novel` entity slice with:
  - current list/detail/stats HTTP contracts;
  - `useNovels`, `useNovel`, and `useNovelStats`;
  - stable `novelKeys`;
  - public `novelInvalidation` adapters;
  - slice-owned model aliases and current `NovelCover`/`NovelLibraryCard` UI.
- Added the read-only `chapter` entity slice with:
  - public `getChapter` and `useChapter`;
  - stable chapter keys;
  - paragraph DOM identity helper;
  - current `ChapterList` and `ChapterReader` UI.
- Added the read-only `task` entity slice with:
  - task list/detail/events/summary and novel-task reads;
  - `useTasks`, `useTask`, `useTaskEvents`, `useTaskSummary`, and `useNovelTask`;
  - stable task keys and public invalidation adapters;
  - task status/outcome helpers and `TaskProgress`.
- Added the read-only `scheduler` entity slice with status and per-novel diagnostics reads, query hooks, keys, and invalidation adapters.
- Added the read-only `search` entity slice with current library-search GET contract, normalized result keys, query hook, and invalidation adapters.
- Added generic disconnected-polling options to reads that require fallback polling. Callers can provide `enabled`, `staleTime`, `connectionState`, `pollingIntervalMs`, and focus behavior without entities owning realtime lifecycle.
- Added regression coverage for public exports, endpoint/query parity, GET-only ownership, exact key shapes, and invalidation ownership.
- Normalized remaining shared-UI internal `@/shared/*` imports to relative imports so entity public indexes can be imported by the root Node regression command as required by the plan. This is resolution-only and does not change shared UI behavior.

## Locked Decisions

- Entity slices contain GET reads only. Product writes remain deferred to feature-owned tasks.
- Transport types enter at each entity API boundary. Reusable UI and model logic consume slice-owned aliases instead of importing transport types directly.
- Query keys and invalidation adapters remain colocated with their owning entity and are exported only through each slice `index.ts`.
- Novel realtime routing can call `invalidateList`, `invalidateStats`, and `invalidateDetail` independently.
- Task realtime routing can call `invalidateAll`, `invalidateDetail`, and `invalidateNovel` independently, matching the locked Task 9 route order.
- Scheduler status and novel diagnostics have separate invalidation methods.
- Search invalidation owns only the `search` query root and results subtree.
- A missing generic connection state is treated as disconnected for polling fallback; a later app-level realtime provider will pass `connected` to disable fallback polling.
- Chapter reads do not poll and are cached with a five-minute default stale time.
- Reader-owned selectors and custom properties remain inside the chapter entity UI until the reader adapter/preferences extraction in Task 11.
- Source Reader entity slices have not been started.

## RED -> GREEN Evidence

The first Task 4 regression run reported 4 failures because the five entity slices did not exist.

During GREEN verification, importing an entity public index exposed unresolved `@/shared/*` aliases inside several Task 3 shared UI primitives when running the plan's root `node --import tsx --test` command. Those imports were converted mechanically to equivalent relative paths, after which the public indexes imported successfully.

The final Task 4 regression file passes all API, ownership, key, invalidation, and UI-export assertions.

## Fresh Verification

The following commands completed successfully from dependencies restored with `npm ci --ignore-scripts` using the checkpoint lockfile:

```powershell
node --import tsx --test tests/regression/web-next-core-entities.test.ts tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-scaffold.test.ts
npm run check:web-next-arch
npm run check:web-next
npm run build:web-next
npm run build:web
npm run check:lockfile
npx prettier --check apps/web-next/src/entities apps/web-next/src/shared/ui tests/regression/web-next-core-entities.test.ts
git diff --check
```

Recorded results:

- Core entity, shared, architecture, and scaffold regression tests: 26 pass, 0 fail.
- Real `apps/web-next` architecture check: pass.
- `web-next` TypeScript check: pass.
- `web-next` production build: pass with Vite `8.1.4`.
- Current `apps/web` production build: pass with Vite `8.1.4`.
- Lockfile portability: pass.
- Targeted formatting check: pass.
- Whitespace/error-marker check: pass.

The full repository regression and integration suites were not rerun for this frontend entity-query task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 5, build Source Reader entity query slices.

Do not begin Task 6 before Task 5 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
