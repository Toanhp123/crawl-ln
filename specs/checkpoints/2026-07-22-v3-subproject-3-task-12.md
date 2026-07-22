# Novel Tool V3 Subproject 3 Task 12 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Tasks 1 through 11: complete.
- Subproject 3, Task 12, Port the App Shell, Providers, Router, and Navigation Widgets: complete.
- Task 11 checkpoint commit: `9dfa7a6` (`docs: checkpoint v3 subproject 3 task 11`).
- Task 12 implementation commit: `4a0a3e3` (`feat: port v3 application shell`).
- Working branch: `feat/v3-web-next-app-shell`.
- No Task 13 Library, Activity, Task Detail page, or supporting widget work has been started.

## Completed Scope

- Added the complete Web Next provider order: app theme, app i18n, TanStack query client, realtime, toast, error boundary, maintenance, reader preferences, and browser router.
- Added app-owned EN/VI shell catalogs and a safe typed API error interpreter that maps public error codes to localized generic copy without exposing server messages.
- Merged every existing public entity and feature `*Catalogs` export into the app catalog without deep imports or product mutation ownership in `app`.
- Added query cache restoration before React mount and persistence startup after mount.
- Added an app-owned persistence policy that keeps only novel lists, task summary, scheduler status, and source-plugin list queries.
- Added the persistent application shell with one app route Suspense boundary, skip link, desktop sidebar, mobile header, bottom tabs, safe-area layout, bounded scroll restoration, and global add-novel overlay composition.
- Added a focus-safe portal reader shell with inert background handling and reader-specific scroll viewport.
- Added the frozen public route table, synchronous home redirect, legacy redirects, lazy route loaders, idle preloading, constrained-network opt-out, and navigation-intent preloading.
- Added public `app-header` and `bottom-tabs` widget indexes.
- Kept future Task 13-15 route targets lazy and compilable through the existing foundation page until their owning page tasks replace those loaders.
- Added Task 12 regression coverage for route ownership, mutation boundaries, provider order, persistence policy, startup sequencing, preloading, navigation widgets, reader shell behavior, and app i18n composition.

## Locked Decisions

- Product mutation names, HTTP methods, and action workflows remain absent from `app`, `pages`, and `entities`.
- `AddNovelProvider` and `AddNovelOverlay` are composed from the feature public API; the shell does not reproduce add-novel state or workflow logic.
- Query cache persistence is injected by `app` into the generic shared persistence adapter.
- Chapter content, task events, Source Reader secrets, and administration queries are not persisted.
- Domain event routing remains owned by `app/realtime`; `shared/realtime` remains generic.
- App i18n consumes only public slice indexes. It discovers the single public `*Catalogs` export from each slice and validates the bilingual shape at startup.
- Error rendering uses localized public code mappings and optional request IDs; raw server messages are not shown by the app interpreter.
- Home redirect remains synchronous and performs no startup query.
- Route chrome remains mounted while lazy page content suspends.
- Slow or data-saving network connections skip idle route preloading.
- Task 13 remains untouched.

## RED -> GREEN Evidence

The first valid Task 12 test run failed all nine tests because the route table, layouts, providers, navigation widgets, startup persistence, and app i18n files did not exist.

The initial GREEN implementation passed the focused shell tests and compiler checks. Running the prior Task 6-8 ownership suites then exposed a real compatibility issue: importing action catalog symbols by their mutation-shaped names caused source ownership tests to classify the app catalog as product mutation logic. The app catalog was refactored to consume namespace public APIs and discover exactly one bilingual `*Catalogs` export per slice. This retained public-index ownership, removed mutation-shaped identifiers from app source, and restored all earlier ownership tests.

A runtime catalog check confirmed both languages contain 269 merged keys. A runtime error-translation check confirmed `NOT_FOUND` is localized and only the request ID is appended, while the server message remains hidden.

## Fresh Verification

The following checks completed after the final source refactor and amended implementation commit:

```powershell
node --experimental-sqlite --loader /tmp/task11-ts-loader.mjs --test tests/regression/web-next-scaffold.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-core-entities.test.ts tests/regression/web-next-source-reader-entities.test.ts tests/regression/web-next-library-task-features.test.ts tests/regression/web-next-settings-data-features.test.ts tests/regression/web-next-source-reader-features.test.ts tests/regression/web-next-realtime-routing.test.ts tests/regression/web-next-reader-adapters.test.ts tests/regression/web-next-app-shell.test.ts tests/regression/reader-engine-architecture.test.ts tests/regression/source-reader-web-console-contract.test.ts tests/regression/source-reader-web-contract.test.ts packages/reader-engine/tests/*.test.ts
node --test apps/web/tests/startup-layout-stability.test.mjs
npm run check -w @novel-tool/reader-engine
npm run check:reader-engine-arch
npm run prepare:packages
npm run check:web-next-arch
npm run check:web-next
npm run check:web-contracts
npm run check:lockfile
npm run build:reader-engine
node scripts/check-prepared.mjs --skip-typescript
prettier --check apps/web-next/src/app/i18n apps/web-next/src/app/layouts apps/web-next/src/app/providers apps/web-next/src/app/router apps/web-next/src/main.tsx apps/web-next/src/widgets/app-header apps/web-next/src/widgets/bottom-tabs tests/regression/web-next-app-shell.test.ts
git diff --check
```

Recorded results:

- Task 1-12 frontend, reader-engine, and Source Reader security/contract tests: 84 pass, 0 fail.
- Task 12 focused app-shell tests: 9 pass, 0 fail.
- Current-app startup layout stability tests: 5 pass, 0 fail.
- Reader-engine TypeScript and purity checks: pass.
- Package preparation and reader-engine build: pass.
- Real `apps/web-next` FSD architecture check: pass.
- `web-next` TypeScript check: pass.
- Frozen frontend contract check: pass.
- Prepared architecture, documentation, and formatting checks: pass.
- Lockfile portability: pass.
- Targeted Prettier and whitespace checks: pass.
- Runtime app catalogs: 269 EN keys and 269 VI keys.

The current-app `cache-prefetch-phase3.test.mjs` acceptance file has one pre-existing failure: legacy `apps/web/src/widgets/app-header/ui/AppHeader.tsx` does not expose `onRouteIntent`. Task 12 does not modify the legacy app, and the new Web Next header does expose pointer, focus, and touch route intent. The other four cache/prefetch assertions pass.

The clean checkpoint ZIP does not contain `node_modules`. The available dependency tree originated on Windows. `npm run build:web-next` completed its TypeScript stage but the Vite shim was not executable on Linux. Running Vite's JavaScript entrypoint directly confirmed the missing optional native dependency `@rolldown/binding-linux-x64-gnu`.

This is an execution-environment dependency limitation rather than a Task 12 source or type failure. Rerun the production frontend build after a normal Linux `npm ci` with registry access.

The full repository regression and integration suites were not rerun for this isolated frontend app-shell task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 13, Port Library, Activity, and Task Detail Screens.

Do not begin Task 14 before Task 13 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
