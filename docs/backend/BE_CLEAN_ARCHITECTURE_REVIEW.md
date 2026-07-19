# BE Clean Architecture Review

## Status

This backend is now closer to a clean modular monolith. It is acceptable as the base before implementing real source adapters.

## Layer rules

Each business module follows this direction:

```txt
presentation -> application -> domain
infrastructure -> domain
shared/container -> wires application + infrastructure + presentation
```

Forbidden dependencies:

- domain importing application, infrastructure, or presentation
- application importing presentation
- shared importing modules
- controllers creating repositories/use cases directly
- route files creating business objects directly

## Improvements in this pass

- `NovelController` no longer depends on raw `TaskRepository`.
- Task presentation now depends on task use cases instead of repository directly.
- Query and command use cases were split from the old mixed `GetNovelUseCase` responsibility.
- `CrawlNovelUseCase` now depends on `CrawlQueuePort`, not concrete `CrawlQueueService`.
- Added shared ports:
  - `ClockPort`
  - `IdGeneratorPort`
  - `TransactionPort`
- Added system adapters:
  - `SystemClock`
  - `CryptoIdGenerator`
- Added SQLite transaction adapter placeholder for unit-of-work style migration later.

## Current score

```txt
Modular monolith:      8.5/10
Clean architecture:    8.3/10
Controller thinness:   8.5/10
Use case separation:   8.2/10
Infrastructure split:  8.2/10
Error/API standard:    8.0/10
Crawler boundary:      8.2/10
Maintainability:       8.4/10
```

## Remaining non-blocking issues

- `NovelSqliteRepository` still owns mapping and SQL in one file. Fine now, but split mapper/query later if it grows past ~200 lines.
- `CrawlQueueService` is still the largest application service. Fine now, but split worker/retry/progress if real crawling becomes complex.
- `GetNovelUseCase` old file still exists for backward compatibility but should be removed once imports are fully migrated.
- `TransactionPort` exists, but most repositories still call SQLite transaction directly. Move transaction orchestration to application layer later when multi-repository writes increase.
- No automated dependency boundary lint yet.

## Decision

Backend is now good enough to start real crawler adapter work, as long as new adapter code stays inside:

```txt
modules/crawler/infrastructure/sources/<source-name>.adapter.ts
```

and does not leak into controllers or novel use cases.
