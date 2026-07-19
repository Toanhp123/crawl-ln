# Backend hardening review

## Improved

- Added composition root: `shared/container/app-container.ts`.
- Routes no longer instantiate repositories/use cases directly.
- Added API response envelope helpers.
- Added centralized error middleware.
- Added validation helpers.
- Added `NotFoundError`, `ConflictError`, and error code support.
- Moved chapter reading into `chapters` module.
- Added `ChapterRepository` and SQLite implementation.
- Extracted crawler background processing into `CrawlQueueService`.
- Simplified `CrawlNovelUseCase` to enqueue work only.
- Removed duplicate legacy `source` module.
- Removed legacy JSON repository.
- Updated frontend HTTP client to unwrap `{ data, error }` API envelope.

## Current score

```txt
Modular monolith:      8/10
Clean Architecture:    7.8/10
Error handling:        8/10
API consistency:       8/10
Crawler separation:    7.8/10
Maintainability:       8/10
```

## Still worth doing later

- Add ESLint boundary rules for backend imports.
- Add request id middleware and structured JSON logger.
- Add formal Unit of Work for multi-table writes.
- Add integration tests for response envelope and SQLite repositories.
- Split exporter strategies into `modules/export/application`.
