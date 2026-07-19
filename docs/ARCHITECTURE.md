# Architecture

Novel Tool is an npm monorepo with a TypeScript modular-monolith API and a React Feature-Sliced frontend.

## Runtime layout

```text
apps/api          Express API, background crawl queue, SQLite
apps/web          React, Vite, Tailwind, TanStack Query
packages/shared   Public API contracts and Zod request schemas
sources           Dynamic source plugins
tests             Regression, integration, and browser smoke tests
```

## Backend modules

```text
backup
chapters
crawler
export
novels
plugin
scheduler
search
task
```

Each backend module owns its application, domain, infrastructure, and presentation code where applicable. Direct imports between bounded modules are forbidden. Shared technical ports and public transport contracts live outside feature modules. The composition root under `apps/api/src/shared/container` wires module public APIs.

Task queries are owned by `/api/tasks`. Crawl creation, control, and events are owned by `/api/crawl/jobs`. Novel analysis and library queries are owned by `/api/novels`. EPUB/TXT export is owned only by `/api/exports`.

## Frontend layers

```text
app -> pages -> widgets -> features -> entities -> shared
```

The frontend uses strict `/api/*` routes and the shared response envelope. Reader-specific state and cache behavior live under `apps/web/src/modules/reader`.

## Persistence and lifecycle

SQLite connections are runtime-owned and closed after queue and scheduler shutdown. Schema changes run through ordered migrations. Crawl start, chapter progress, and finalization use synchronous SQLite transaction bodies. Backup replace/merge validates compatibility and restores inside a maintenance window.

## Verification

```bash
npm run check
npm run test:regression
npm run test:integration
npm run build
npm run verify
```

`npm run check` includes architecture, crawler, frontend-contract, formatting, and TypeScript gates.
