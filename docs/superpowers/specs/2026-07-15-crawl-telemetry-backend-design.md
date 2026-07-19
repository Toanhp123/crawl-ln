# Crawl Telemetry Backend Design

## Goal
Provide persisted crawl speed, ETA, graceful pause/resume, chapter-level events, and safe restart recovery while preserving the existing Clean Architecture boundaries.

## Decisions
- Pause is graceful: active chapter requests finish and persist, then no new chapter starts.
- On process restart, queued/running/pausing/resuming jobs become paused and require explicit resume.
- Telemetry is persisted in SQLite.
- Chapter events are stored separately from task snapshots.
- ETA and speed are calculated by the application service and exposed through the task DTO.
- Existing cancel semantics remain terminal.

## Architecture
- Domain: extend `CrawlTaskEntity`; add `CrawlEvent` entity and repository contract.
- Application: queue owns runtime state, emits events, and persists metric snapshots. Dedicated use cases handle pause, resume, list events, and startup recovery.
- Infrastructure: SQLite migration, task mapper changes, event repository.
- Presentation: add pause/resume/events endpoints.
- Web: poll task + event endpoints and render speed, ETA, lifecycle controls, and real timeline.

## API
- `POST /api/crawl/jobs/:id/pause`
- `POST /api/crawl/jobs/:id/resume`
- `GET /api/crawl/jobs/:id/events?limit=100`
- Existing detail response includes persisted metrics.
