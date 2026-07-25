# Architecture

Novel Tool is an npm monorepo with a TypeScript modular-monolith API and a React frontend organized by Feature-Sliced Design.

## Runtime layout

```text
apps/api                 Express API, SQLite, ingestion queue and Source Reader
apps/web                 React, Vite, Tailwind and TanStack Query
packages/shared   Zod request schemas and public transport types
tests             Regression, integration and browser E2E
```

## Backend modules

```text
backup
export
ingestion
library
scheduler
search
source-reader
```

Each module owns its domain, application, infrastructure, presentation and public API layers where applicable. Cross-module calls use public façades or narrow ports wired by the composition root at `apps/api/src/bootstrap/app-container.ts`. Feature modules do not import another module's internal folders.

Key ownership rules:

- `source-reader` owns website/plugin execution, credential/session/network/browser runtime and normalized source results.
- `ingestion` orchestrates source analysis, jobs, chapter fetching and progress through public Source Reader and Library ports.
- `library` owns persisted novels, chapters, reading data and the query/command APIs used by other modules.
- `scheduler` initiates updates through public Library and Ingestion APIs.
- `search` and `export` consume already persisted data.
- `backup` controls maintenance windows but does not own business records.

## Frontend

```text
app → pages → widgets → features → entities → shared
```

Pages compose route screens. Widgets combine independent features and entities. Features own user actions and mutations. Entities own domain queries, public display models and entity UI. Shared owns transport, configuration, utilities, theme and reusable UI primitives.

The reader experience is owned by the `features/read-chapter` slice. It consumes the public `@novel-tool/reader-engine` package and keeps reader state, caching and navigation inside that feature boundary.

## Data flow

```text
Website
  ↓
Source Reader plugin/runtime
  ↓
Ingestion
  ↓
Library records + ingestion jobs in SQLite
  ↓
Library + Reader + Search + Export
```

A Source Reader outage blocks new ingestion but does not block reading, searching or exporting content already stored locally.

## Lifecycle and persistence

SQLite is opened by the platform database adapter and closed only after ingestion, scheduler and Source Reader shutdown. Ordered migrations own schema changes. Multi-record operations use synchronous SQLite transaction bodies.

## Backup and Restore control plane

Backup and Restore orchestration is persisted in a separate `backup-control.sqlite` database under the configured storage directory. The control plane stores operation, preparation-session, artifact and hashed-token metadata; it is not included in user backups. Private uploads, staging files and downloadable artifacts live under `backup-temp` and are addressed by server-generated identifiers rather than user filenames or filesystem paths.

A Backup/Restore **operation** is durable execution state. A Restore **session** is the resumable upload, inspection and planning state that exists before execution. Only one Backup or Restore operation may be queued or running globally, and only one Restore preparation session may exist globally. Realtime invalidation uses the `backup` resource; the browser polls only when realtime is disconnected.

Merge Restore recomputes its reviewed plan inside one outer SQLite write transaction and rolls every contributor back together when the target changed or any contributor fails. Replace Restore first creates and validates an unencrypted safety artifact, then promotes an adjacent `.new` database with a durable journal and `.rollback` file. Startup reconciles that journal before opening the primary database.

Operations are never resumed automatically after an API restart. Persisted queued/running work is marked interrupted, while Replace journal recovery restores a valid database before normal startup continues.

## Verification

```bash
npm run check
npm run build
npm test -- --suite regression
npm test -- --suite integration
npm test -- --suite e2e
```

`npm run check` includes API modular-monolith, FSD, HTTP-contract, documentation, formatting and TypeScript checks.
