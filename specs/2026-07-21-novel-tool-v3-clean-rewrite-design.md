# Novel Tool V3 Clean Rewrite Design

**Status:** Approved architecture direction, pending written-spec review

**Date:** 2026-07-21

## Purpose

Novel Tool V3 will replace the current implementation with a parallel clean implementation while preserving observable product behavior. The rewrite targets a strict TypeScript modular monolith on the backend and semantic Feature-Sliced Design on the frontend.

The rewrite is not a visual redesign and does not change the product contract. Existing HTTP endpoints, JSON envelopes, SQLite data, Source Plugin SDK compatibility, mobile behavior, and user workflows remain the reference behavior until an explicitly approved contract change is made.

## Goals

- Enforce backend bounded-context ownership in TypeScript and SQLite.
- Keep domain and application code independent from transport and infrastructure contracts.
- Eliminate cross-module SQL and global business logic in composition roots.
- Decompose Source Reader into focused application services behind one public facade.
- Enforce semantic FSD ownership, not only directory naming and import direction.
- Require every FSD slice consumer to use the slice public API.
- Keep `shared` domain-agnostic.
- Preserve the current public HTTP contract and migrate schema-version-22 data safely.
- Build the replacement beside the current applications so the current implementation remains a behavioral oracle.
- Make architecture rules executable through reliable static checks and contract tests.

## Non-Goals

- No visual redesign during the architecture rewrite.
- No new source capabilities or crawler features.
- No change to public API routes or response envelopes.
- No replacement of SQLite.
- No microservices or network communication between backend modules.
- No mandatory Turborepo adoption. npm workspaces remain sufficient for the initial rewrite.
- No mutation of installed external plugin packages or Source Plugin SDK contract versions.

## Global Constraints

- Node.js remains `>=22.12.0`.
- npm remains `>=10` with a portable public-registry lockfile.
- HTTP success and error responses retain the canonical `{ data, error }` envelope.
- Existing 204 and binary endpoint semantics remain unchanged.
- The V3 implementation must import existing schema-version-22 databases without changing record IDs.
- Existing Source Plugin SDK capability contract version `1` and sandbox protocol version `1` remain supported.
- Local-first operation and Termux support remain product requirements.
- Current `apps/api` and `apps/web` remain runnable until cutover acceptance is complete.

## Repository Strategy

The clean implementation is built in parallel:

```text
apps/api             current reference backend
apps/web             current reference frontend
apps/api-next        V3 backend
apps/web-next        V3 frontend
packages/shared      existing public HTTP transport contracts
packages/source-plugin-sdk
packages/reader-engine   new pure reader engine package
```

The new applications use separate package names and development ports. They must not write to the same SQLite file as the current API during parallel development.

At cutover, the current applications are retained in Git history, the `-next` applications replace their workspace roles, and package names are normalized in one final mechanical change.

## Backend Architecture

### Target Bounded Contexts

#### Library

Owns:

- Novels and chapter catalog metadata.
- Downloaded chapter content and content versions.
- Novel lifecycle state visible to the library.
- Library queries used by Reader, Search, and Export.
- Novel update preferences that are intrinsic library metadata only when they are not scheduler execution state.

Tables use a `library_` prefix, including `library_novels` and `library_chapters`.

The current `novels` and `chapters` modules are combined because analysis, reconciliation, deletion, and chapter identity require one transactional boundary.

#### Ingestion

Owns:

- Crawl jobs, job state transitions, progress, outcomes, retries, and cancellation.
- Crawl audit events.
- Queue recovery and execution coordination.
- Idempotency records for content-delivery commands sent to Library.

Tables use an `ingestion_` prefix, including `ingestion_jobs`, `ingestion_job_chapters`, and `ingestion_events`.

The current `crawler` and `task` modules are combined because a task is the persisted state machine of a crawl workflow.

#### Source Reader

Owns:

- Built-in and external source plugins.
- Plugin package installation, integrity, permission, activation, and health.
- Credentials, sessions, authentication challenges, and secret encryption.
- Network profiles, browser coordination, cache, cursor, and plugin invocation.
- Normalized source capability results.

Tables retain the `source_reader_` prefix to preserve a clear migration boundary.

#### Scheduler

Owns:

- Scheduling policies and next-run state.
- Scheduler diagnostics.
- Initiation of update workflows through public Library and Ingestion APIs.

Scheduler state moves out of novel rows into `scheduler_policies` and `scheduler_diagnostics`. Scheduler infrastructure never updates Library tables.

#### Search

Owns:

- Search projections and FTS indexes.
- Projection checkpoints and rebuild operations.

Search consumes Library events. It does not query or trigger directly against Library tables in the steady-state design.

#### Export

Owns:

- EPUB and text output pipelines.
- Export validation and binary writers.

Export reads through `LibraryQueryApi` and never reads Library tables directly.

#### Backup and Maintenance

Owns:

- Maintenance-window coordination.
- Full replace snapshots.
- Merge import orchestration through module contributor ports.
- Backup archive format and encryption.

Replace restore may operate on an offline whole-database snapshot. Merge restore must call module-owned import contributors rather than write business tables directly.

### Module Template

Every backend module uses this layout:

```text
modules/<module>/
  domain/
    entities/
    value-objects/
    policies/
    repositories/
  application/
    commands/
    queries/
    services/
    ports/
    events/
  infrastructure/
    sqlite/
    migrations/
    adapters/
  presentation/
    controllers/
    dto/
    mappers/
    routes/
  public/
    <module>.api.ts
    <module>.contracts.ts
  index.ts
```

Rules:

- Domain imports only domain code and small generic platform ports.
- Application imports domain code and application ports.
- Infrastructure implements module-owned ports and maps database rows to module-owned models.
- Presentation maps public transport contracts to application inputs and outputs.
- `public/` exposes narrow interfaces and immutable contracts for other modules.
- Other modules import only `public/`.
- Module composition files construct dependencies but contain no business conditionals or repository queries.

### Data Ownership

Each module owns its tables and migrations. A module migration may mention only tables with its registered prefixes. The platform migration runner collects ordered module migrations and records both global and module schema versions.

Cross-module foreign keys are forbidden. Cross-module references are opaque string IDs. Each module validates referenced resources through a public API when synchronous validation is required.

Infrastructure must not use `@novel-tool/shared` as a persistence or domain model. `packages/shared` remains an HTTP transport package. Presentation mappers are the only backend locations that map directly to those transport contracts, except binary transport utilities with no business meaning.

### Cross-Module Communication

Two communication modes are supported:

1. Synchronous public commands and queries for request-response workflows.
2. Persisted application events for projections, realtime invalidation, audit, and recoverable side effects.

No global SQL transaction may update more than one module's tables. Cross-module workflows use a stable `commandId` and idempotent commands.

Example chapter ingestion flow:

```text
Ingestion fetches and validates a chapter
  -> LibraryCommands.saveChapterContent(commandId, chapter)
  -> Library commits content and records commandId
  -> IngestionCommands.recordChapterCompleted(commandId, jobId)
  -> Ingestion commits progress
```

If the process stops after the Library commit, Ingestion recovery resends the same command. Library returns the prior result for the same `commandId`, and Ingestion completes its state transition.

### Application Events and Outbox

Business transactions that publish durable events write a module-owned outbox row in the same transaction. A platform dispatcher reads registered module outboxes and publishes in-process events. Consumers keep module-owned inbox or checkpoint state when duplicate delivery would be harmful.

Realtime publication, Search projection, and non-critical audit handling subscribe outside the producer's transaction. Event handlers cannot turn an already committed business command into a failure.

### Composition Root

`apps/api-next/src/bootstrap` owns construction and lifecycle only:

- Environment parsing.
- Database opening and migration registration.
- Module factory invocation.
- Public API wiring.
- HTTP route registration.
- Ordered startup and shutdown.

It must not contain:

- Domain decisions.
- Event-to-resource mapping.
- Repository queries.
- Error policy decisions.
- Anonymous use-case implementations.

Those behaviors live in module application or dedicated integration adapters.

## Source Reader Internal Design

Source Reader remains one bounded context but is decomposed internally.

```text
SourceReaderFacade
  -> CandidateResolver
  -> RuntimeContextResolver
  -> ReaderCachePolicy
  -> InvocationCoordinator
  -> PluginResultValidator
  -> PaginationCoordinator
  -> HealthAndFallbackPolicy
```

Responsibilities:

- `CandidateResolver`: matcher normalization, deterministic priority, capability availability, and cursor binding.
- `RuntimeContextResolver`: actor, credential, session, network route, and browser identity resolution.
- `ReaderCachePolicy`: cache lookup scopes, stale-while-revalidate, cache key construction, and invalidation tags.
- `InvocationCoordinator`: rate limit, circuit breaker, timeout, browser session, plugin context, and runtime invocation.
- `PluginResultValidator`: capability result schemas and extension contracts.
- `PaginationCoordinator`: bounded limits, host cursors, progress checks, and streaming page budgets.
- `HealthAndFallbackPolicy`: eligibility, success/failure recording, quarantine decisions, and typed fallback.

The facade exposes the existing `SourceReaderApi`. Plugin administration is implemented by separate application services and controllers. No business service is defined inside a module factory.

## Actor and Authorization Model

Local mode uses a stable actor ID of `local-user` when no actor header is supplied. This makes user-owned credential and network forms work in the single-user local application.

Remote requests follow these rules:

- `API_REMOTE_TOKEN` authenticates access to the API boundary but does not establish a user identity.
- `x-source-reader-user-id` and `x-source-reader-roles` are both ignored unless trusted actor headers are explicitly enabled.
- Existing `SOURCE_READER_TRUST_ROLE_HEADERS=true` gates both remote identity and role headers for compatibility.
- Ownership checks consume only the trusted actor produced by middleware.
- Public reader requests without a trusted actor may use public source access and explicitly permitted system profiles, but never user-owned resources.

The public HTTP header names remain unchanged.

## Frontend Architecture

### Strict FSD Layers

```text
app       bootstrap, providers, router, integration orchestration
pages     URL state and screen composition
widgets   independent page-scale UI blocks
features  user actions, mutations, validation, action UI
entities  entity queries, query keys, models, and reusable entity UI
shared    domain-agnostic transport, configuration, utilities, theme, and primitives
```

Every slice has a public `index.ts`. Consumers cannot import `api/`, `model/`, or `ui/` paths from outside that slice.

### Ownership Rules

- Entity read clients and TanStack Query hooks live in `entities/<entity>`.
- Entity query keys live beside their entity API and are exported through the entity public API.
- Mutations, invalidation policy, validation, and action UI live in `features/<action>`.
- Pages hold route parsing and compose public feature/entity/widget APIs.
- App initializes providers and coordinates cross-cutting integrations. App does not implement product mutations.
- Widgets may coordinate lower layers but cannot own domain mutations that belong to a feature.
- Shared cannot contain novel, chapter, task, scheduler, Source Reader, or reader-navigation concepts.

Examples:

- `features/add-novel` owns analyze-then-crawl behavior and the global overlay.
- `features/pause-task`, `features/resume-task`, and `features/cancel-task` own task commands.
- `entities/novel` exports `useNovels`, `useNovel`, `useNovelStats`, and novel query keys.
- `entities/task` exports task queries and task query keys.
- `app/realtime` consumes backend events and calls public invalidation adapters exported by entities.

### Realtime Integration

Shared owns only the generic SSE transport and a generic batching utility. Domain event interpretation lives in `app/realtime` because app may depend on all lower layers.

Each entity exports a narrow invalidation adapter, for example:

```ts
export interface NovelInvalidationApi {
  invalidateList(client: QueryClient): Promise<unknown>;
  invalidateDetail(client: QueryClient, novelId: string): Promise<unknown>;
}
```

The app-level event router maps `RealtimeEvent` resources to these public adapters without importing entity internals.

### Reader Engine

The pure reader window, cache policy, chapter source orchestration, cancellation, and navigation state move to `packages/reader-engine`.

The package:

- Has no React, router, browser storage, or application HTTP imports.
- Defines ports for chapter fetching and persistent cache.
- Owns reader window and session behavior tests.

`apps/web-next` supplies adapters for HTTP, IndexedDB, React hooks, and route navigation. The Reader page composes a reader feature/controller and presentation widgets; it does not own scrolling, persistence, bookmark, or infinite-loading algorithms directly.

### Localization and UI

The existing design system, theme tokens, mobile acceptance rules, English/Vietnamese support, and shared UI primitives are retained.

Shared localization runtime remains generic. Slice-specific translation dictionaries may be registered by slices, while global navigation and generic UI strings remain in app/shared dictionaries.

## Public Contract Compatibility

Before V3 behavior is implemented, the current API is captured as executable contract tests:

- Route, method, status, envelope, and error-code contracts.
- Omitted versus nullable optional fields.
- Binary export and backup headers.
- SSE event schemas.
- Source Reader redaction and request-ID behavior.
- Pagination, cursor, and timeout boundaries.

The same test suite runs against both current API and `api-next`. Contract changes require a separate approved specification and are not folded into the rewrite.

## Database Migration and Rollback

V3 introduces a new schema version after current version 22.

Migration procedure:

1. Stop current queue, scheduler, Source Reader, and HTTP writes.
2. Create an encrypted or local safety backup using the current backup path.
3. Copy the database and content storage to a staging location.
4. Run the V3 importer against the staging copy.
5. Validate counts, IDs, task outcomes, chapter content hashes, plugin metadata, credentials, sessions, and scheduler policies.
6. Start `api-next` on the migrated staging storage and run integration smoke tests.
7. Replace production storage only after validation succeeds.

The importer preserves IDs and timestamps. It maps:

- `novels` and `chapters` to Library tables.
- `crawl_tasks` and `crawl_events` to Ingestion tables.
- novel scheduler columns and diagnostics to Scheduler tables.
- current Source Reader tables to their V3 equivalents.
- FTS content to Search projections, followed by a deterministic rebuild.

Failed validation leaves original storage untouched. Rollback restores the pre-migration snapshot and restarts the current API.

Current and next APIs must never write the same database concurrently.

## Testing Strategy

### Architecture Tests

- Resolve static, dynamic, alias, and relative imports through the TypeScript compiler API.
- Enforce backend module public APIs and dependency direction.
- Parse SQL strings and migration registrations to reject foreign module table prefixes.
- Reject transport-contract imports outside backend presentation and explicitly allowed binary adapters.
- Reject business statements in composition roots.
- Enforce FSD public indexes and reject deep imports.
- Reject entity-specific query keys or domain identifiers in frontend shared.
- Reject product mutations in frontend app/pages.
- Enforce that `packages/reader-engine` has no React, browser, router, or app imports.

### Unit Tests

- Domain state machines and policies.
- Application commands and queries through in-memory ports.
- Source Reader pipeline stages independently.
- Reader engine window, cache, cancellation, and recovery behavior.

### Integration Tests

- Each module against SQLite with only its public API exposed to the test.
- Outbox delivery and idempotent command recovery.
- Schema-version-22 migration fixtures.
- External plugin sandbox, credentials, routes, challenges, and browser identity.
- HTTP contract parity against the current API.

### Browser Tests

- Existing mobile Chromium E2E flows run against `web-next`.
- Reader navigation, scroll restoration, offline cache, and bounded rendering retain current acceptance behavior.
- Source Reader administration retains secret-redaction guarantees.

## Delivery Decomposition

The rewrite is split into independently reviewable subprojects.

### Subproject 1: Contract Freeze and Backend Foundation

- Golden HTTP and migration fixtures.
- `api-next` bootstrap, module framework, migration registry, event/outbox platform, error handling, and actor model.
- Library and Ingestion skeletons with no production cutover.

### Subproject 2: Backend Capability Migration

- Library, Ingestion, Source Reader, Scheduler, Search, Export, and Backup behavior.
- V22-to-V3 importer.
- Backend parity and recovery tests.

### Subproject 3: Frontend Foundation and Capability Migration

- `web-next` app shell, strict FSD guard, entity query APIs, action features, realtime integration, and reader-engine package.
- Screen-by-screen parity without visual redesign.

### Subproject 4: Cutover and Cleanup

- Full verification against migrated storage.
- Production workspace rename and startup command switch.
- Removal of old applications only after rollback documentation and release acceptance.

Each subproject receives its own implementation plan and must leave the repository runnable and testable.

## Acceptance Criteria

- Current public HTTP contract tests pass against `api-next`.
- Schema-version-22 fixtures migrate without ID or content loss.
- No backend module imports another module's internals.
- No backend module SQL references another module's table prefix.
- No backend domain/application/infrastructure model depends on HTTP transport types.
- Composition roots contain construction and lifecycle wiring only.
- Source Reader facade delegates to focused pipeline services.
- All frontend slices expose public indexes and all external consumers use them.
- Frontend shared is domain-agnostic.
- Pages contain route state and composition but no product mutations.
- Entity queries and feature mutations are owned by the correct slices.
- Reader engine logic is pure and independently tested.
- `npm run check`, build, regression, integration, and browser E2E pass for the cutover candidate.
- Current production storage remains recoverable through the documented rollback procedure.

## Risks and Mitigations

- **Behavior drift:** Golden contract and parity tests run against both implementations.
- **Data loss:** Migration runs on a copy and requires validation before replacement.
- **Long-lived duplicate code:** Work is delivered by capability, with explicit cutover gates and no speculative V3-only features.
- **Cross-module consistency complexity:** Stable command IDs, idempotent handlers, outbox delivery, and recovery tests replace global SQL transactions.
- **Source Reader regressions:** Existing SDK, package, sandbox, and security fixtures remain canonical inputs.
- **Frontend visual drift:** Existing token system and browser acceptance tests remain unchanged during the architecture phase.
- **Termux resource pressure:** Build/test commands retain process isolation and bounded concurrency; V3 introduces no mandatory orchestration dependency.

## Decision Summary

- Build V3 beside the current applications.
- Preserve external behavior and migrate data rather than preserve internal structure.
- Combine transactional concepts into Library and Ingestion bounded contexts.
- Use module-owned tables, migrations, public APIs, outboxes, and idempotent commands.
- Keep Source Reader as one bounded context with decomposed internal services.
- Build the frontend with strict semantic FSD and a pure reader-engine package.
- Cut over only after contract, migration, integration, and browser parity gates pass.
