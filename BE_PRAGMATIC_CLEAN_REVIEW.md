# BE Pragmatic Clean Architecture Review

This refactor intentionally moves away from folder-driven over-engineering.

## Decisions

- Keep module folders practical instead of deeply nested.
- Keep `application/use-cases` as the main orchestration layer.
- Do not create application services when a use case already expresses the operation clearly.
- Move persistence to `infrastructure/sqlite` and mapping to `infrastructure/mappers`.
- Put business rules in domain entities/value objects, not in controllers or repositories.

## Layer responsibilities

### Domain

Contains entities, value objects, repository contracts and core business behavior.
Examples:

- `NovelEntity.canExport()`
- `NovelEntity.markCrawling()`
- `ChapterEntity.markFetched()`
- `ChapterEntity.markFailed()`
- `CrawlTaskEntity.recordChapterResult()`
- `NovelUrl`, `NovelTitle`, `ChapterIndex`, `CrawlStatus`

### Application

Use cases coordinate domain, ports and repositories.
They may decide workflow order, but should avoid low-level infrastructure logic.

### Infrastructure

Contains SQLite repositories, row mappers, crawler source adapters, HTTP client and queue implementation.

### Presentation

Contains Express controllers, routes, DTO validation and response formatting.

## Remaining future improvement

The next clean step is to move `chapters` and `task` under a bounded `novels` module only if they never become standalone API modules. For now they remain separate because existing routes consume them directly.
