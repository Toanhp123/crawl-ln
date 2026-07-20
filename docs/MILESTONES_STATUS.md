# Milestones Status

## Milestone 1 — Core Crawler Platform

Status: hardened platform foundation.

Done:

- `SourceReaderApi` is the only source-runtime boundary used by the crawler.
- URL identification, metadata, chapter lists, chapter content, search, and latest updates use capability contracts rather than selector-profile loading.
- Built-in plugins execute through the in-process runtime; verified external plugins execute through the supervised process sandbox.
- Host-mediated HTTP, HTML, browser, authentication, network routing, cancellation, and observability are available through constrained runtime capabilities.
- Crawl analysis and chapter fetching delegate source reads to Source Reader while crawler-owned services retain novel, chapter, and task persistence.
- Robots policy, host-aware rate limiting, persistent crawl state, and architecture guards remain enforced at their owning boundaries.
- API: `POST /api/crawl/analyze`, `GET /api/crawl/sources`.
- Guard: `npm run check:crawler` rejects legacy source runtimes, direct Source Reader infrastructure imports, and crawler boundary leaks.

Still intentionally outside M1:

- Production tuning for additional real-world sources and anti-bot behavior.
- A durable distributed crawl queue; the current runtime queue remains process-local.
- Additional advanced `robots.txt` edge cases.

## Milestone 2 — Data / Queue / Resume

Status: MVP only.

- SQLite stores novels, chapters, and crawl tasks.
- Crawl tasks can resume pending chapters at API level.
- Queue execution is still in-memory at runtime.

## Milestone 3 — Reader

Status: MVP only.

- Frontend displays fetched chapter text and uses the bounded Reader Engine for windowing and cache-first loading.
- Reader preferences and long-term synchronization remain intentionally lightweight.

## Milestone 4 — Export

Status: production-capable core formats.

- EPUB3 and UTF-8 BOM TXT export are supported by the standalone export module.
- JSON, HTML, and Markdown compatibility flows remain available where exposed by the current UI/API.
- Translation-tool-specific export is not implemented.

## Milestone 5 — Multi-source / Source Reader

Status: platform-complete, continued source validation required.

- Source plugins are versioned packages with capability contracts, deterministic matching, integrity verification, approval, activation, quarantine, and health policy.
- External packages use `manifest.json`, `dist/index.js`, and complete checksum coverage.
- Credentials, sessions, network profiles, browser sessions, challenge flows, scoped cache, and signed cursors are centralized in Source Reader.
- Public JavaScript-heavy sources and authenticated browser-required sources are supported through host-managed browser sessions.
- Crawler, HTTP administration, and Sources UI are migrated to `/api/source-reader/*`.
- Built-in fixture and end-to-end coverage validate the current reference source; more production sources should be validated before claiming broad ecosystem coverage.
