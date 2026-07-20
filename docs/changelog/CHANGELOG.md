
## Milestone 1.5 - Production Polish

- Fixed mobile Library overflow by replacing horizontal scrolling cards with a responsive grid.
- Added bottom-navigation-safe page padding so Recent Tasks and lower workspace content are not covered.
- Improved reader drawer layout for Android browser safe areas and long chapter content.
- Hid internal task UUIDs in Recent Tasks.
- Added chapter title fallback display in UI.
- Extract chapter title before content cleanup during chapter fetch.
- Added content sanitizer for common Patreon/support footer blocks.

# Changelog

## 0.3.0

- Add library search.
- Add stats endpoint and dashboard cards.
- Add chapter reader endpoint and UI.
- Add delete novel API and UI button.
- Add HTML export.
- Add Termux setup script.
- Improve HTTP 204 handling.

## 0.2.0

- SQLite storage.
- Background crawl queue.
- Task progress.
- Retry/concurrency/delay config.

## 0.4.0 - Crawl cancellation and selector adapter

- Added cancel crawl job endpoint: `DELETE /api/crawl/jobs/:id`.
- Added configurable selector-based HTML source adapter.
- Added the original file-based source configuration and example.


## Milestone 1 started - Core Crawler Platform

- Added crawler HTTP port/adapter.
- Added Cheerio HTML parser port/adapter.
- Added JSON source profile repository.
- Selector adapter now uses injected platform services instead of direct HTTP/parser imports.
- Robots policy now fetches `robots.txt` for allowlisted hosts.

## E2E NovelCool profile pass

- Added an enabled NovelCool source profile for the inspected DOM.
- Source profiles now accept selector fallback arrays, not only one CSS selector.
- Chapter extraction now reads HTML and normalizes `<br>` into line breaks, which supports NovelCool-style chapter pages where content is plain text separated by `<br>` tags.
- Termux example env allowlist now includes `novelcool.com` and `www.novelcool.com`.
