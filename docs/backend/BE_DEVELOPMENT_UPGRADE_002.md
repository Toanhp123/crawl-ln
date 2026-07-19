# BE Development Upgrade 002

## Added

- `DELETE /api/crawl/jobs/:id` to cancel queued/running crawl jobs.
- `CancelCrawlJobUseCase` in crawler application layer.
- Queue cancellation signal in `CrawlQueuePort` and `CrawlQueueService`.
- `SelectorHtmlAdapter` for real site integration through CSS selector profiles.
- Example selector profile at `apps/api/config/source-profiles.example.json`.

## Architecture notes

- Presentation calls use cases only.
- Application depends on ports/repositories only.
- Source-specific crawling stays in infrastructure adapters.
- Site selectors are external config, not domain/application logic.
