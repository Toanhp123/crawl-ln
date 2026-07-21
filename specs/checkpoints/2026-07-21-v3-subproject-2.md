# Novel Tool V3 Subproject 2 Checkpoint

Date: 2026-07-21

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Backend parity code commit: `e816960` (`feat: complete v3 backend parity`).
- Checkpoint tag: `checkpoint/v3-subproject-2`.
- Integration target: `feat/source-plugin-sdk`.
- No known backend blocker remains.

## Completed Scope

- Added the parallel `apps/api-next` runtime and enforced modular-monolith and Clean Architecture boundaries.
- Implemented Library ownership for novels and chapters.
- Implemented recoverable Ingestion jobs, crawl execution, audit events, pause/resume/cancel, and maintenance locking.
- Decomposed and ported Source Reader application, runtime, security, persistence, administration, and HTTP capabilities.
- Added Scheduler-owned update policies and diagnostics.
- Added the event-driven Search projection.
- Ported EPUB and TXT export through Library queries.
- Added encrypted backup, replace/merge restore, module contributors, rollback, and V22-to-V3 staged import validation.
- Completed Library, chapter, task, crawl, scheduler, search, export, backup, Source Reader, CORS, JSON 404, and SSE HTTP parity.
- Added durable application-event to realtime-resource mapping.

## Locked Architecture Decisions

- `apps/api` remains runnable as the reference backend until Subproject 4 cutover.
- `apps/api-next` is the V3 backend oracle and uses port `3100` for Subproject 3.
- Library and Ingestion public APIs produced by Subproject 1 remain unchanged.
- HTTP-only orchestration lives on internal application surfaces, not public module contracts.
- Controllers depend on public APIs or focused application services and contain no repository or SQL access.
- Each backend table is owned by one module; no module SQL references another module table prefix.
- Cross-module effects use public APIs or durable application events and idempotent command IDs.
- Search is an event-driven projection and Export reads through Library queries.
- Backup restore stops Outbox and Scheduler, locks Ingestion, performs restore work, then restarts services in reverse order.
- Realtime mapping lives in `platform/realtime/application-event-to-realtime.adapter.ts`.

## Milestone Commits

### Subproject 1

- `635620e` test: make regression fixtures cross-platform
- `3c07efe` fix: trust source reader actor identity explicitly
- `8bdf44b` test: freeze core http contracts
- `7d824f9` test: add deterministic v22 database fixture
- `2238f0b` feat: scaffold v3 api runtime
- `b1d32e8` test: enforce v3 backend architecture
- `19df742` feat: add module-owned migration platform
- `88432b9` feat: add recoverable application event dispatch
- `6f6ceed` feat: define v3 library module boundary
- `6b34eef` feat: define v3 ingestion module boundary
- `6348844` feat: complete v3 backend foundation

### Subproject 2

- `771ed11` feat: add v3 library domain
- `5616822` feat: reconcile v3 library analysis
- `356162b` feat: complete v3 library api
- `b869b99` feat: add v3 ingestion state and persistence
- `d5ae415` feat: add v3 ingestion analysis workflows
- `e4cd5e7` feat: add recoverable v3 ingestion queue
- `8c9a89f` feat: add decomposed source reader pipeline
- `941709f` feat: port secure source reader runtime
- `e4b38a2` feat: complete v3 source reader api
- `e534025` feat: add scheduler-owned update policies
- `c2090b6` feat: add v3 search projection
- `4e4ebf7` feat: port v3 export module
- `a3e78fe` feat: add v22 migration and v3 backup
- `e816960` feat: complete v3 backend parity

## Fresh Verification at Backend Parity

The following commands completed successfully after the final architecture review:

```powershell
npm run verify:v3:backend
node scripts/check-docs.mjs
npm run check:lockfile
git diff --check
```

Recorded results:

- API Next architecture, TypeScript check, and build: pass.
- Contract tests: 18 pass, 0 fail.
- Regression tests: 506 pass, 0 fail.
- Integration tests: 160 pass, 0 fail, 1 skipped.
- Documentation and lockfile portability checks: pass.

## Workspace Safety Note

At checkpoint creation, the main checkout contained pre-existing user changes in:

- `package-lock.json`
- `scripts/setup-termux.sh`
- `scripts/termux-dev.sh`

These changes are not part of Subprojects 1 or 2 and must not be reverted or overwritten.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- First task: scaffold the parallel `apps/web-next` runtime on port `5174`, preview port `4174`, against API Next on port `3100`.

Subproject 3 changes `package-lock.json`. Use npm `10.9.2` for lockfile-changing commands and preserve the pre-existing main-checkout lockfile work when creating the next isolated branch/worktree.
