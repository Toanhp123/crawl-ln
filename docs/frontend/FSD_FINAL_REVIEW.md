# Web FSD final hardening review

## Status

Web is now acceptable as the frontend baseline before moving back to backend crawler work.

## What was hardened

- `pages/home` no longer owns API mutations directly.
- Feature hooks now live in their own feature `model` folders:
  - `features/analyze-novel/model/useAnalyzeNovel.ts`
  - `features/crawl-novel/model/useCrawlNovel.ts`
  - `features/delete-novel/model/useDeleteNovel.ts`
- Entity read hooks now live in entity `model` folders:
  - `entities/task/model/useTasks.ts`
- Removed noisy pass-through feature folders: `read-novel`, `read-task`.
- Added app-level `ErrorBoundaryProvider`.
- Centralized React Query client in `shared/api/queryClient.ts`.
- Added import alias `@/*` in Vite and TypeScript.
- Consolidated table components under `DataTable` naming.

## Boundary rules

```txt
app      -> pages/widgets/features/entities/shared
pages    -> widgets/features/entities/shared
widgets  -> features/entities/shared
features -> entities/shared
entities -> shared
shared   -> no upper layer imports
```

## Remaining acceptable debt

- No automated FSD boundary lint yet.
- Route-level lazy loading is active for the main pages.
- Some shared UI still imports `cn` using local relative paths; this is acceptable inside the same layer.

## Next recommended step

Move to backend hardening: module boundaries, error response shape, queue persistence, adapters, crawler runtime, and SQLite repository cleanup.
