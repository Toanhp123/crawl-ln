# Milestones Status

## Milestone 1 — Core Crawler Platform

Status: hardened platform foundation.

Done:

- HTTP client port/adapter: `HttpClientPort` + `AxiosHttpClientAdapter`.
- Robots policy: allowlist + cached `robots.txt` parsing with user-agent groups, allow/disallow priority, wildcard basics, and crawl-delay.
- HTML engine: `HtmlParserPort` + Cheerio adapter.
- Source profile: typed `SourceProfile`, `SourceProfileSchema`, JSON repository, duplicate-id detection, legacy profile normalization.
- Source detection: `SourceDetectorService` resolves URL -> source profile.
- Crawl engine: `CrawlerEngineService` owns analyze/fetch flow and uses only ports.
- Adapter boundary: selector adapter delegates to engine; legacy singleton HTTP client removed.
- Host-aware rate limiter: delay is tracked per host, not globally.
- API: `POST /api/crawl/analyze`, `GET /api/crawl/sources`.
- Guard: `npm run check:crawler` prevents crawler code from using legacy singleton HTTP and catches boundary leaks.

Still intentionally not done in M1:

- Real site profile tuning.
- Persistent crawl queue.
- Advanced robots edge cases.
- Browser rendering / JS-heavy sources.

## Milestone 2 — Data / Queue / Resume

Status: MVP only.

- SQLite stores novels, chapters, and crawl tasks.
- Crawl queue can resume pending chapters at API level.
- Queue itself is still in-memory at runtime.

## Milestone 3 — Reader

Status: MVP only.

- Frontend can display fetched chapter text.
- Reader settings are not mature yet.

## Milestone 4 — Export

Status: MVP only.

- JSON, TXT, HTML, Markdown.
- EPUB and translation-tool-specific export are not done.

## Milestone 5 — Multi-source

Status: platform-ready, not production-proven.

- Add source by JSON profile.
- Need at least one real source profile validated end-to-end before calling this production-ready.
