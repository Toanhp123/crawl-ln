# Novel Tool V3 Subproject 3 Task 9 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Tasks 1 through 8: complete.
- Subproject 3, Task 9, Route Realtime Events in `app/realtime`: complete.
- Task 8 checkpoint commit: `cd70f91` (`docs: checkpoint v3 subproject 3 task 8`).
- Task 9 implementation commit: `bf1e0e8` (`feat: route v3 realtime invalidations`).
- Working branch: `feat/v3-web-next-realtime-routing`.
- No Task 10 reader-engine work has been started.

## Completed Scope

- Added `app/realtime/event-router.ts` with frozen `RealtimeEvent` decoding, app-owned domain resource interpretation, exact public entity invalidation routing, and batch-level resource/identifier deduplication.
- Added an app-owned `RealtimeInvalidationRegistry` using only entity public APIs.
- Added the Source Reader aggregate invalidation adapter, which invokes plugin, credential, network-profile, and authentication-challenge invalidation adapters together through `Promise.all`.
- Added routing for `tasks`, `novels`, `scheduler`, `search`, `plugins`, and `all`.
- Added `RealtimeProvider` with the generic shared SSE transport and generic 150 ms batching utility.
- Added reconnect reconciliation after the first successful connection and visible-tab reconciliation using active-query invalidation only.
- Added app-owned generic connection state through `useRealtimeStatus()` for later disconnected polling fallback composition.
- Added sanitized realtime failure metadata containing only an optional event ID and error class; raw event payloads and error messages are not logged.
- Updated `AppProviders` to compose `QueryClientProvider`, `RealtimeProvider`, and `BrowserRouter`.
- Added regression coverage for exact adapter call order, Source Reader aggregation, `all` short-circuit behavior, frozen event parsing, sanitized failure metadata, generic shared ownership, provider batching, reconnect/visibility behavior, and provider composition.

## Locked Decisions

- Backend resource names and domain event interpretation exist only in `app/realtime`; `shared/realtime` remains generic transport, connection status, and batching infrastructure.
- The event router imports entity capabilities only through their public `index.ts` APIs.
- A `tasks` event invalidates the task root and, when present, the affected task detail and novel-task query.
- A `novels` event invalidates novel list and stats plus the identified novel detail when available.
- A `scheduler` event invalidates scheduler status, diagnostics, and identified novel diagnostics when available.
- A `search` event uses the public search invalidation adapter.
- A `plugins` event maps to the app-owned Source Reader aggregate rather than naming Source Reader query keys in shared infrastructure.
- An `all` event short-circuits all narrower routes and calls `queryClient.invalidateQueries()` once.
- Events received inside the 150 ms window are merged so repeated resources and identifiers do not issue duplicate app-level adapter calls.
- Reconnect reconciliation runs only after a prior successful connection. Visibility reconciliation runs only when the document becomes visible. Both target active queries.
- Parse and EventSource failures log only `{ eventId?, errorClass }`; raw payloads, server details, and error messages are excluded.
- Task 10 remains untouched.

## RED -> GREEN Evidence

The first Task 9 regression run reported 5 failures because `app/realtime/event-router.ts`, `RealtimeProvider.tsx`, and the app-level provider composition did not exist.

The GREEN implementation added the router, registry, Source Reader aggregate, decoder, sanitized metadata, provider lifecycle, 150 ms queue, public index, and `AppProviders` composition. The focused Task 9 regression test then passed 5/5.

A subsequent TypeScript run found that the generic batch queue inferred `unknown`. The queue was explicitly bound to `RealtimeEvent`, after which architecture and TypeScript checks passed.

## Fresh Verification

The following checks completed successfully after formatting:

```powershell
node --experimental-sqlite --loader /tmp/task8-ts-loader.mjs --test tests/regression/web-next-scaffold.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-core-entities.test.ts tests/regression/web-next-source-reader-entities.test.ts tests/regression/web-next-library-task-features.test.ts tests/regression/web-next-settings-data-features.test.ts tests/regression/web-next-source-reader-features.test.ts tests/regression/web-next-realtime-routing.test.ts tests/regression/source-reader-web-console-contract.test.ts tests/regression/source-reader-web-contract.test.ts
npm run check:web-next-arch
npm run check:web-next
npm run check:web-contracts
npm run check:lockfile
node node_modules/prettier/bin/prettier.cjs --check apps/web-next/src/app/realtime apps/web-next/src/app/providers/AppProviders.tsx tests/regression/web-next-realtime-routing.test.ts
git diff --check
```

Recorded results:

- Task 1-9 frontend and Source Reader security/contract regression tests: 56 pass, 0 fail.
- Real `apps/web-next` architecture check: pass.
- `web-next` TypeScript check: pass.
- Frozen frontend contract check: pass.
- Lockfile portability: pass.
- Targeted formatting check: pass.
- Whitespace/error-marker check: pass.

The clean checkpoint ZIP does not contain `node_modules`. A clean npm install could not be completed in this environment because registry DNS resolution was unavailable. The temporary dependency tree available from the prior Windows source ZIP did not contain the Linux native Rolldown binding. Consequently, `npm run build:web-next` completed its TypeScript stage and then stopped with `MODULE_NOT_FOUND` for `@rolldown/binding-linux-x64-gnu` during Vite startup.

A temporary untracked TypeScript loader and temporary dependency symlink were used only to run the same TypeScript test files in Linux. Neither is part of the commit, lockfile, checkpoint, or packaged artifact. Production build should be rerun after a normal Linux `npm ci` when registry access is available.

The full repository regression and integration suites were not rerun for this frontend realtime ownership task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 10, extract the pure `packages/reader-engine` package.

Do not begin Task 11 before Task 10 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
