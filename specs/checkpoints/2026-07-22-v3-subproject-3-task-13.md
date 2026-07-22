# Novel Tool V3 Subproject 3 Task 13 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Tasks 1 through 12: complete.
- Subproject 3, Task 13, Port Library, Activity, and Task Detail Screens: complete.
- Task 12 checkpoint commit: `27fc6e2` (`docs: checkpoint v3 subproject 3 task 12`).
- Task 13 implementation commit: `4d5ca92` (`feat: port v3 library and activity screens`).
- Working branch: `feat/v3-web-next-library-activity-pages`.
- No Task 14 Novel Detail or Reader screen work has been started.

## Completed Scope

- Added the real `/library` page with URL-owned query, scope, sort, filter, and pagination state.
- Added the frozen 12-card library skeleton geometry and responsive 2/3/4/5/6-column grid.
- Added continue-reading composition by matching persisted continuity against the already-loaded novel list, without per-novel detail fallback queries.
- Added stable library search placement across novel and chapter-content scopes.
- Extended the existing search feature with optional controlled query, type, and page inputs while preserving its uncontrolled public behavior.
- Added novel controls, empty states, pagination, import/continue actions, and current list-summary presentation.
- Added the real `/activity` page with running, queued, and recent task grouping.
- Added disconnected-only 15-second activity polling through the generic shared realtime connection store.
- Added the reusable crawl-task card with outcome badge, progress ring, chapter counts, source metadata, and route navigation.
- Added the real `/activity/:taskId` page with task outcome, progress, current and average speed, ETA, paused time, chapter-stage telemetry, event timeline, failed-chapter notice, and public pause/resume/cancel feature composition.
- Added disconnected-only 10-second task/event polling and a five-minute novel-summary stale time.
- Replaced Task 12 foundation loaders for Library, Activity, and Task Detail with their real lazy page modules.
- Added EN/VI page and task telemetry catalog entries.
- Added Task 13 regression coverage for page ownership, URL state, skeleton geometry, continuity behavior, stable search, polling fallback, task grouping, outcome display, telemetry, action composition, public indexes, and router loaders.

## Locked Decisions

- Pages own only route/search/view state and compose public entity, feature, widget, and shared APIs.
- Pages do not own TanStack queries, mutations, HTTP methods, query keys, or product write workflows.
- Library continuity uses list summaries plus persisted reading history; it does not issue novel detail fan-out queries.
- The library search input remains in one stable toolbar position for both novel and chapter-content scopes.
- Content search reuses the library URL `q` and `page` values and fixes the search document type to `chapter` without rendering a second search input or type-filter row.
- Realtime connection state remains generic in `shared/realtime`; product resource routing remains in `app/realtime`.
- Activity and Task Detail poll only while realtime is disconnected.
- Pause, resume, and cancel behavior remains owned by separate feature slices.
- Task 14 remains untouched.

## RED -> GREEN Evidence

The first valid Task 13 regression run failed all nine tests because the Library, Activity, Task Detail, continue-reading, library-grid, and crawl-task-card slices did not exist and the route loaders still targeted the Task 12 foundation page.

The initial GREEN implementation passed all nine focused tests and the Web Next architecture/compiler checks. Self-review then found a visual and route-state parity gap: chapter-content scope rendered a separate search input inside the search feature, moving the search control and splitting query/page ownership. A new failing assertion locked the required controlled search contract. The search feature was extended with optional controlled query/type/page props, and Library now renders one stable toolbar input while passing URL state into a chapter-only result panel. The focused suite returned to nine passes.

A second self-review removed an unused router import from the Activity page model. The full Task 1-13 regression gate was then rerun from scratch.

## Fresh Verification

The following checks completed after the final source changes:

```powershell
node --experimental-sqlite --loader /tmp/novel-tool-ts-loader.mjs --test tests/regression/web-next-scaffold.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-core-entities.test.ts tests/regression/web-next-source-reader-entities.test.ts tests/regression/web-next-library-task-features.test.ts tests/regression/web-next-settings-data-features.test.ts tests/regression/web-next-source-reader-features.test.ts tests/regression/web-next-realtime-routing.test.ts tests/regression/web-next-reader-adapters.test.ts tests/regression/web-next-app-shell.test.ts tests/regression/web-next-library-activity-pages.test.ts tests/regression/reader-engine-architecture.test.ts tests/regression/source-reader-web-console-contract.test.ts tests/regression/source-reader-web-contract.test.ts packages/reader-engine/tests/*.test.ts
node scripts/check-web-next-architecture.mjs
node node_modules/typescript/bin/tsc -p apps/web-next/tsconfig.json --noEmit
node scripts/check-reader-engine-architecture.mjs
node node_modules/typescript/bin/tsc -p packages/reader-engine/tsconfig.json --noEmit
npm run build:reader-engine
node scripts/check-web-contracts.mjs
node scripts/check-lockfile-portability.mjs
prettier --check <Task 13 source and regression paths>
git diff --check
```

Recorded results:

- Task 1-13 frontend, reader-engine, and Source Reader security/contract tests: 93 pass, 0 fail.
- Task 13 focused tests: 9 pass, 0 fail.
- Real `apps/web-next` FSD architecture check: pass.
- `web-next` TypeScript check: pass.
- Reader-engine TypeScript and purity checks: pass.
- Reader-engine production build: pass.
- Frozen frontend contract check: pass.
- Lockfile portability: pass.
- Targeted Prettier and whitespace checks: pass.

The legacy current-app command below records eight passes and one pre-existing failure:

```powershell
node --test apps/web/tests/network-efficiency-phase2.test.mjs apps/web/tests/task-refresh-stability.test.mjs
```

The failing legacy assertion slices `apps/web/src/pages/Settings.tsx` between the markers `const plugins` and `const runScheduler`. The second marker no longer exists, so the test inspects an empty string before evaluating the Source Reader polling assertion. Task 13 does not modify the legacy Settings page. The Library summary, task detail polling, task summary, mutation invalidation, task polling, window-focus, and refresh-indicator assertions pass.

`npm run build:web-next` completed its TypeScript stage but could not execute the Windows-originated Vite shim on Linux. Running Vite's JavaScript entrypoint directly confirmed that the available dependency tree lacks `@rolldown/binding-linux-x64-gnu`. This is an execution-environment optional native dependency limitation, not a Task 13 source or type failure. Rerun the production frontend build after a normal Linux `npm ci` with registry access.

The full repository regression and integration suites were not rerun for this isolated frontend screen task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 14, Port Novel Detail and Reader Screens.

Do not begin Task 15 before Task 14 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
