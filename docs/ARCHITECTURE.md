# Architecture

Novel Tool is an npm monorepo with a TypeScript modular-monolith API and a React frontend organized by Feature-Sliced Design.

## Runtime layout

```text
apps/api-legacy          Express API, SQLite, crawl queue and Source Reader
apps/web-legacy          React, Vite, Tailwind and TanStack Query
packages/shared   Zod request schemas and public transport types
tests             Regression, integration and browser E2E
```

## Backend modules

```text
backup
chapters
crawler
export
novels
scheduler
search
source-reader
task
```

Each module owns its domain, application, infrastructure and presentation code where applicable. Cross-module calls use public façades or narrow ports passed by `apps/api-legacy/src/shared/container`. Feature modules do not import another module's internal folders.

Key ownership rules:

- `source-reader` owns website/plugin execution, credential/session/network/browser runtime and normalized source results.
- `crawler` orchestrates analysis and chapter fetching through the Source Reader public port.
- `novels`, `chapters` and `task` own persisted library/crawl state.
- `scheduler` initiates updates through public novel/crawler APIs.
- `search` and `export` consume already persisted data.
- `backup` controls maintenance windows but does not own business records.

## Frontend

```text
app → pages → widgets → features → entities → shared
```

Pages compose route screens. Widgets combine independent features and entities. Features own user actions and mutations. Entities own domain queries, public display models and entity UI. Shared owns transport, configuration, utilities, theme and reusable UI primitives.

The isolated `modules/reader` public façade contains the reader engine contract; FSD slices consume only its public index.

## Data flow

```text
Website
  ↓
Source Reader plugin/runtime
  ↓
Crawler
  ↓
Novels + Chapters + Tasks in SQLite
  ↓
Library + Reader + Search + Export
```

A Source Reader outage blocks new ingestion but does not block reading, searching or exporting content already stored locally.

## Lifecycle and persistence

SQLite is opened by shared infrastructure and closed only after queue, scheduler and Source Reader shutdown. Ordered migrations own schema changes. Multi-record operations use synchronous SQLite transaction bodies. Backup/restore enters maintenance mode before replacing or merging storage.

## Verification

```bash
npm run check
npm run build
npm run test:regression
npm run test:integration
npm run verify
```

`npm run check` includes API/crawler/FSD/HTTP-contract/documentation guards, formatting and TypeScript checks.
