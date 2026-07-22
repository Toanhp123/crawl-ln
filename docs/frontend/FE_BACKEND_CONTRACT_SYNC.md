# Frontend ↔ Backend Contract Baseline (3.0.0)

The frontend treats backend 3.0.0 as the single source of truth.

## HTTP rules

- JSON endpoints must use the `{ data, error }` envelope.
- Successful JSON responses have `{ data: T, error: null }`.
- Failed responses have `{ data: null, error: { code, message, details } }`.
- Raw JSON compatibility fallbacks are forbidden.
- Commands documented as HTTP 204 use `httpVoid`; they are not parsed as JSON.
- Binary backup/export endpoints use direct `fetch` but share the typed API error parser.

## Canonical routes

- Task queries: `/api/tasks`
- Crawl commands/events: `/api/crawl/jobs`
- Search: `/api/search`
- Source Reader plugins: `/api/source-reader/plugins`
- Export: `/api/exports/novels/:id`
- Backup/restore: `/api/backups`

## Shared contracts

Public API types belong in `@novel-tool/shared`. Frontend features should not redefine backend response objects when a shared contract exists.

## Optional fields

Backend optional response fields are omitted when absent. Frontend code must handle `undefined`; it must not assume absent fields are converted to `null`. Explicitly nullable fields remain `T | null` in the shared contract.

## Enforcement

`npm run check:web-contracts` rejects:

- API helper paths that do not start with `/api/`;
- legacy raw-envelope fallbacks;
- free-form API error codes;
- removed export/crawl endpoints;
- hard-coded frontend release versions.
