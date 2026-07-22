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

SQLite is opened by the platform database adapter and closed only after ingestion, scheduler and Source Reader shutdown. Ordered migrations own schema changes. Multi-record operations use synchronous SQLite transaction bodies. Backup/restore enters maintenance mode before replacing or merging storage.

## Verification

```bash
npm run check
npm run build
npm run test:regression
npm run test:integration
npm run verify
```

`npm run check` includes API modular-monolith, FSD, HTTP-contract, documentation, formatting and TypeScript checks.
