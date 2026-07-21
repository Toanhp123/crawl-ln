# Novel Tool V3 Subproject 3 Task 5 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Task 1, Scaffold the Parallel `web-next` Runtime: complete.
- Subproject 3, Task 2, Add the Strict TypeScript-AST FSD Guard: complete.
- Subproject 3, Task 3, Port the Domain-Free Shared Platform and Visual Foundation: complete.
- Subproject 3, Task 4, Build Library, Chapter, Task, Scheduler, and Search Entities: complete.
- Subproject 3, Task 5, Build Source Reader Entity Query Slices: complete.
- Task 4 checkpoint commit: `b1d25a5` (`docs: checkpoint v3 subproject 3 task 4`).
- Task 5 implementation commit: `5d4c6a0` (`feat: add v3 source reader entities`).
- Working branch: `feat/v3-web-next-source-reader-entities`.
- No known blocker remains for Subproject 3, Task 6.

## Completed Scope

- Added the read-only `source-plugin` entity slice with:
  - plugin list, diagnostics, health, and permission GET contracts;
  - legacy `pluginId` fallback normalization at the transport boundary;
  - public hooks, stable keys, collection invalidation, model helpers, row UI, and English/Vietnamese catalog fragments.
- Added the read-only `source-credential` entity slice with:
  - redacted credential metadata list GET contract;
  - public hook, stable collection key, collection invalidation, binding helper, row UI, and catalog fragments.
- Added the read-only `source-network-profile` entity slice with:
  - redacted network-profile metadata list GET contract;
  - public hook, stable collection key, collection invalidation, health-tone helper, row UI, and catalog fragments.
- Added the read-only `source-auth-challenge` entity slice with:
  - challenge list and detail GET contracts;
  - list/detail hooks with disconnected polling fallback;
  - stable keys, collection invalidation, expiry helper, row UI, and catalog fragments.
- Added the generic domain-free `CollectionInvalidationApi` to the shared API boundary and used it for all four Source Reader entity adapters.
- Added regression coverage for:
  - public exports and required `api/model/ui/i18n/index.ts` slice structure;
  - exact query-key shapes and endpoint encoding;
  - GET-only ownership;
  - plugin identifier normalization;
  - write-only request/result type exclusion and secret-field redaction boundaries;
  - collection-owned invalidation roots.

## Locked Decisions

- Source Reader entities own GET metadata and diagnostics only. Install, enable, disable, permission decisions, credential writes/authentication, network-profile writes/tests, and challenge resolution remain feature-owned work for Task 8.
- Write-only credential values and request models do not enter entity metadata models or entity public APIs.
- Transport types enter through each entity API boundary; reusable model/UI code consumes slice-owned aliases.
- Each Source Reader entity exports its own keys and one `CollectionInvalidationApi` adapter without importing sibling entities.
- Plugin list compatibility keeps the current `id ?? pluginId` normalization and rejects descriptors missing identity, name, trust level, or status.
- Plugin diagnostics and health preserve the current frozen GET endpoint behavior.
- Authentication-challenge polling runs only while enabled and disconnected; the later app realtime provider can pass `connected` to disable fallback polling.
- Entity-specific English/Vietnamese catalog fragments are exported but are not composed into the app provider until the app-shell/catalog composition tasks.
- No Task 6 library/task action feature has been started.

## RED -> GREEN Evidence

The first Task 5 regression run reported 4 failures because all four Source Reader entity slices were missing.

The GREEN implementation added the four slices, generic collection invalidation contract, read-only APIs, query hooks, keys, models, UI, catalogs, and redaction tests. The focused Task 5 test then passed 4/4.

A final redaction-boundary review additionally locked out known write-only Source Reader request/result transport types so future entity changes cannot reintroduce credential values or administration contracts through type imports.

## Fresh Verification

The following commands completed successfully from dependencies restored with `npm ci --ignore-scripts` using the checkpoint lockfile:

```powershell
node --import tsx --test tests/regression/web-next-source-reader-entities.test.ts tests/regression/web-next-core-entities.test.ts tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-scaffold.test.ts
npm run check:web-next-arch
npm run check:web-next
npm run build:web-next
npm run build:web
npm run check:lockfile
npx prettier --check apps/web-next/src/entities/source-* apps/web-next/src/shared/api/invalidation.ts apps/web-next/src/shared/api/index.ts tests/regression/web-next-source-reader-entities.test.ts
git diff --check
```

Recorded results:

- Source Reader entity, core entity, shared, architecture, and scaffold regression tests: 30 pass, 0 fail.
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
- Next task: Task 6, implement Library and Task action features.

Do not begin Task 7 before Task 6 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
