# Backend Modularity Refactor

## Goal

Reduce backend coupling without changing public API behavior.

## Implemented boundaries

- `CrawlQueueService`: command orchestration, cancellation/pause state, per-novel execution lock.
- `CrawlJobRunnerService`: one crawl task lifecycle, chapter workers, retries, persistence, and events.
- `CrawlProgressService`: deterministic speed and ETA calculation.
- `AutoUpdatePolicyRepository`: scheduler-owned policy queries and state persistence.
- Application lifecycle: background scheduler and recovery start explicitly instead of during dependency construction.

## Deferred follow-up

Numbered SQLite migrations and per-module container factories remain separate, lower-risk follow-up work. The current schema behavior was intentionally preserved in this release.
