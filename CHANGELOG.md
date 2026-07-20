# Changelog

## Unreleased - Source Reader Platform

- Replaced the previous source-selection runtime with the capability-based Source Reader boundary.
- Added built-in and isolated external plugins, signed package verification, permission approval, health quarantine, and deterministic fallback.
- Added encrypted credentials, sessions, network profiles, resumable authentication challenges, browser coordination, scoped cache, signed cursors, rate limiting, circuit breaking, and redacted observability.
- Migrated crawler reads, secured HTTP administration, and the Sources UI to `/api/source-reader/*`.
- Added architecture, integration, regression, browser, and final-lockdown verification.

## 2.9.6 - Web Performance Stability

- Moved Library search, filtering, sorting, counting, and pagination into SQLite queries.
- Changed `/api/novels` to return a bounded paginated result instead of the full library.
- Removed the Crawl page full-library request used only to label recent tasks.
- Added a 200-chapter IndexedDB LRU limit with pruning and quota recovery for Reader cache.
- Added regression and integration coverage for pagination and performance boundaries.

## 2.9.5 - Web Flow Hardening

- Fixed the five-item mobile bottom navigation with dynamic columns.
- Added adaptive task polling and removed full-dataset polling from Crawl and Library.
- Added safe Search URL parameter parsing and state-aware home routing.
- Localized skip links and refresh action labels.
- Extracted Reader wake-lock and Settings choice controls from page components.

## 2.9.4 - Final Logic Cleanup

- Removed the legacy `POST /api/novels/crawl` endpoint and its novels-side wrapper.
- Removed duplicate crawl task query routes; `/api/tasks` is now the only task query surface.
- Removed obsolete frontend route redirects, dead feature/entity/widget files, unused backend artifacts, and deprecated `ListItem`.
- Removed unused compile-time source adapter examples from production code.
- Added a cleanup regression gate and Prettier formatting gate.
- Updated current architecture, API, source configuration, and E2E documentation to the canonical contracts.

## 2.9.3 - Frontend Contract Synchronization

- Aligned all frontend API calls with the canonical `/api/*` routes from backend 2.9.2.
- Removed legacy dual-envelope parsing and untyped API error fallbacks.
- Added strict shared `ApiResponse` handling and a dedicated HTTP 204 helper.
- Moved plugin, backup, and update result types into shared API contracts.
- Removed obsolete Settings section implementations and stale frontend version constants.
- Added a frontend contract architecture gate to prevent legacy endpoints and envelope fallbacks from returning.

## 2.9.2 - Backend Module Boundary Lockdown

- Moved task and novel state transitions out of the composition root into module-owned lifecycle services.
- Removed direct imports between bounded contexts; plugin HTTP/parser capabilities now live in shared ports.
- Replaced repository leakage with explicit task, novel lifecycle, active-task and export-query module APIs.
- Strengthened the architecture checker to reject all direct cross-module imports and container access to domain internals.
- Made SQLite transaction callbacks synchronous-only to match `DatabaseSync` semantics.
- Replaced delete-all chapter persistence with stable-ID reconciliation that preserves fetched content.
- Added schema migration 10 and runtime validation for strict task status/outcome invariants.
- Unified optional response semantics: absent optional fields are omitted, while error details remain explicitly nullable.
- Derived backup schema compatibility from the migration registry instead of a duplicated hard-coded number.
- Added architecture and integration coverage for module boundaries, chapter reconciliation, transaction safety and outcome constraints.

## 2.9.1 - Backend Contract and Data Hardening

- Reworked backup merge to remap novel, chapter, task, and event identities instead of relying on blind `INSERT OR IGNORE`.
- Added automatic database and cover rollback for failed replace restores, encrypted safety backups, and explicit backup/app/schema compatibility metadata.
- Removed the legacy novel export pipeline so the export module is the single owner of EPUB/TXT export.
- Removed cross-module concrete dependencies from crawler and scheduler controllers and split chapter/scheduler routes by module ownership.
- Added stable response null normalization, a typed error-code contract, JSON 404 responses, and removed raw FTS rank from public search results.
- Added runtime SQLite row validation and schema-level integrity triggers for statuses, outcomes, counters, and diagnostics.
- Fixed a critical crawl persistence SQL parameter shift that could write outcome and following task fields into the wrong columns.
- Added backend integration coverage for restore remapping/rollback, invalid database records, API response contracts, and persistence column correctness.

## 2.9.0 - Search Engine

- Added SQLite FTS5 global search across novel titles, chapter titles, source names, and downloaded chapter content.
- Added relevance ranking, highlighted snippets, filters, pagination, automatic indexing triggers, and manual index rebuild.
- Added a responsive Search page and desktop/mobile navigation.
- Added migration, API, integration, and regression coverage.

## 2.8.0 - Reader Engine

- Added a bounded frontend Reader Engine module with pure window management, cache-first chapter loading, and presentation orchestration.
- Added forward infinite reading with automatic next-chapter loading near the end of the stream.
- Added on-demand previous chapter loading near the top while preserving the visible scroll position.
- Added bounded five-chapter rendering and LRU memory eviction to prevent unbounded DOM and memory growth.
- Added IndexedDB chapter cache for offline reuse of previously opened chapters.
- Preserved paragraph-anchor reading positions, reading history, bookmarks, reader preferences, swipe navigation, and route compatibility.
- Added active chapter URL synchronization without page navigation or scroll jumps.
- Added Reader Engine regression coverage for window behavior, cache-first loading, and page delegation.

## 2.7.0 - Dynamic Source Plugins

- Added a dedicated source plugin module with manifest validation and Plugin API v2 compatibility checks.
- Added dynamic discovery and hot reload from `sources/<plugin-id>/`.
- Added enable/disable persistence, priority ordering, capabilities, health metrics and failure isolation.
- Added restricted plugin context exposing HTTP, HTML parsing, logger and clock capabilities only.
- Integrated plugins into crawler source selection without coupling plugin application code to crawler contracts.
- Added plugin management API and Settings UI.
- Added example selector plugin and plugin platform integration tests.

# 2.6.0 - Backup & Restore

- Added standalone backup bounded module with archive, storage, crypto, and maintenance ports.
- Added `.nvt` backups containing a consistent SQLite snapshot, downloaded content, covers, and browser settings.
- Added optional AES-256-GCM password encryption with scrypt-derived keys and SHA-256 payload validation.
- Added replace and merge restore modes, optional settings restore, and automatic pre-restore safety backups.
- Added a restore maintenance window that blocks new crawl jobs and waits for the scheduler before database import.
- Added Settings UI for creating and restoring backups.
- Added encrypted round-trip, merge, checksum/password, and safety-backup integration coverage.

# 2.5.0 - Export EPUB/TXT

- Added standalone export bounded module with source and writer ports.
- Added EPUB3 and UTF-8 BOM TXT exports.
- Added downloaded-only filtering and optional chapter ranges.
- Added POST `/api/exports/novels/:id` binary download endpoint.
- Upgraded mobile export sheet with format, range and downloaded-only controls.
- Added export pipeline and EPUB package integration tests.

# Changelog

## 2.9.4 - Final Logic Cleanup

- Removed the legacy `POST /api/novels/crawl` endpoint and its novels-side wrapper.
- Removed duplicate crawl task query routes; `/api/tasks` is now the only task query surface.
- Removed obsolete frontend route redirects, dead feature/entity/widget files, unused backend artifacts, and deprecated `ListItem`.
- Removed unused compile-time source adapter examples from production code.
- Added a cleanup regression gate and Prettier formatting gate.
- Updated current architecture, API, source configuration, and E2E documentation to the canonical contracts.

## 2.4.1 - Backend boundary hardening

- Moved feature repository construction out of the shared infrastructure module and into the owning task, chapter, crawler, novel, and scheduler module factories.
- Added explicit `api`, `presentation`, `lifecycle`, and `internal` module surfaces so the composition root connects modules without exposing a global repository bag.
- Replaced the novels-to-crawler concrete use-case alias with a novels-owned `CrawlNovelUseCase` wrapper over `CrawlJobCreatorPort`.
- Replaced NovelController's concrete task use-case dependency with the novels-owned `NovelTaskQueryPort`.
- Isolated Express route factories from `AppContainer`; routes now accept only the controllers they bind.
- Added architecture enforcement for route isolation and feature-owned repository construction.
- Preserved all HTTP contracts, database migrations, crawl behavior, scheduler behavior, and task outcomes.

## 2.4.0 - Crawl task outcomes

- Added `outcome: success | partial | failure` to crawl tasks while keeping lifecycle status unchanged.
- Added migration 7 to backfill outcomes for existing completed and failed tasks.
- Updated task list, progress, and detail UI to show partial completion clearly.
- Added outcome domain and migration integration coverage.

## 2.3.7 - Backend module boundaries

- Split the application composition root into focused infrastructure, task, chapter, crawler, novel, and scheduler module factories.
- Added novels-owned ports for source analysis and crawl-job creation instead of importing crawler concrete use cases.
- Moved canonical chapter URL identity into the shared domain kernel.
- Removed cross-module infrastructure mapper reuse from scheduler and crawler persistence adapters.
- Strengthened architecture checks with resolved dependency boundaries, direct-clock detection, and cycle detection.
- Added regression coverage that locks the new module organization and dependency rules.

## 2.3.6 - Backend lifecycle and state-machine hardening

- Added graceful queue shutdown that stops new work, aborts pending HTTP requests, pauses active jobs, and waits for runners before closing SQLite.
- Made scheduler shutdown await the active tick and classified concurrent active-task conflicts as skipped rather than failed/backoff.
- Added `AbortSignal` propagation from queue control through chapter fetching, source adapters, crawler engine, and Axios.
- Enforced valid crawl-task state transitions in the domain entity and prevented terminal tasks from being reopened.
- Added a dedicated crawl persistence port and SQLite adapter with synchronous short transactions for task/novel start, chapter/task progress, and task/novel finalization.
- Preserved the prior novel state for paused or cancelled jobs instead of incorrectly marking cancellation as a novel failure.
- Made all crawl events best-effort observability and stopped retry loops immediately on pause, cancellation, or abort.
- Replaced the single idempotent migration block with ordered, transactionally applied schema migrations tracked in `schema_migrations`.
- Added regression and integration coverage for shutdown draining, abort propagation, state guards, scheduler races, finalization rollback, and migration ordering.

## 2.3.5 - Database lifecycle and atomic crawl persistence

- Replaced the process-wide SQLite singleton with explicit per-runtime database instances injected into repositories.
- Moved migration execution to database bootstrap and made connection close idempotent through the runtime lifecycle.
- Added an async transaction port backed by SQLite `BEGIN IMMEDIATE`, commit, and rollback.
- Persisted each chapter result and its task progress update in the same short transaction.
- Added integration coverage for transaction rollback, isolated database instances, and runtime-owned database cleanup.

## 2.3.4 - Backend logic safety

- Prevented late background failures from overwriting completed, failed, or cancelled crawl tasks.
- Serialized multi-worker task progress persistence so slower writes cannot roll counters backward.
- Moved cancellation persistence into the queue/runner lifecycle instead of competing with the cancel use case.
- Made crawl completion and chapter observability events best-effort so event storage failures do not change task outcomes.
- Isolated scheduler diagnostics failures from successful policy updates and update results.
- Added regression coverage for terminal-state protection, queued cancellation, and scheduler diagnostics failures.

## 2.3.3

- Made crawl queue dispatch idempotent by tracking enqueued and running task IDs.
- Prevented duplicate active crawl tasks with an application check and SQLite partial unique index.
- Mapped active-task database constraint failures to a stable conflict error.
- Added guarded background failure reporting so a failed status update cannot become an unhandled rejection.
- Added explicit application runtime lifecycle and graceful scheduler/database shutdown.
- Added schema migration tracking and compatibility cleanup for legacy duplicate active tasks.
- Added behavior and integration coverage for duplicate enqueue and duplicate active-task creation.

## 2.3.2 - Backend modularity foundation

- Split crawl orchestration from job execution and deterministic progress telemetry.
- Removed direct system-time access from crawler application services and scheduler policy updates.
- Moved auto-update persistence ownership out of `NovelRepository` into a scheduler-specific repository port and SQLite adapter.
- Added explicit background-service lifecycle hooks so the application container no longer starts the scheduler during construction.
- Added focused regression coverage for crawl telemetry and injected scheduler clocks.

## 2.3.0 - Auto Update Scheduler & Diagnostics

- Added persisted per-novel automatic update policies (6h, 12h, daily, weekly).
- Added local API scheduler with bounded batches, active-task conflict avoidance, and failure backoff.
- Added update diagnostics history and scheduler status/manual tick endpoints.
- Added Novel Detail controls and Settings scheduler dashboard in English and Vietnamese.
- Added backward-compatible SQLite migrations and shared typed API contracts.

## 2.1.3 - Compact Settings navigation

- Rebuilt Settings as a compact mobile menu that opens detail bottom sheets.
- Removed selected-tab background fills; active bottom tabs now use icon and text color only.
- Kept keyboard focus visible around the compact tab content without affecting touch selection.
- Preserved four-level app font sizing and independent Reader typography.

## 2.1.2 - Mobile density correction

- Removed the large mobile branding header from primary tabs.
- Applied the 11/12/13/14/16/18/22 mobile type scale.
- Reduced cards, filters, task rows, and Crawl vertical hierarchy.
- Changed Library filters to compact horizontal chips.
- Reduced bottom navigation to a 56px bar with contained selected/focus styling.
- Added a four-level app font-size sheet with live preview.
- Flattened mobile surfaces and removed the decorative page gradient.

## 2.1.1 - 2026-07-15

- Refined mobile typography scale and reduced default app font size.
- Reduced card padding, radius, vertical spacing, search height, and task card density.
- Reduced mobile bottom navigation from 72px-style presentation to a 56px bar.
- Limited active/focus treatment to the compact icon-and-label pill instead of the full tab area.
- Added persisted Small, Medium, and Large app-wide font size settings.

## 2.0.4 - 2026-07-15

- Run the Vite CLI through Node instead of the executable shim.
- Avoid `Permission denied` from `node_modules/.bin/vite` on Termux.
- Add a regression check for Termux-safe web scripts.

## 2.0.1 - Maintenance and FSD cleanup

- Synchronized root and workspace package versions with the displayed UI version.
- Declared the root `tsx` test runtime and refreshed workspace dependency metadata.
- Removed the stale `errors.ts.tmp` file.
- Reformatted Crawl and Library pages and moved Library sorting/filtering into its page model.
- Split Settings into a page model and focused Appearance, Language, Reader, and About sections.
- Centralized web version/build metadata and refreshed README architecture and setup guidance.

## 2026-07-15 - NovelCool document.write parser fix

- Materialize static HTML emitted by `document.write(...)` before Cheerio selector queries.
- Restore `.chapter-reading-section` extraction for NovelCool chapter pages whose wrapper is created by JavaScript.
- Add a regression test reproducing NovelCool's dynamic chapter wrapper.

## Milestone 1 crawler platform hardening

- Added the original typed source configuration schema and duplicate-id validation.
- Added the original source-detection and crawl-engine services.
- Refactored selector crawling to use the engine through ports.
- Removed legacy singleton HTTP client path.
- Made rate limiting host-aware.
- Hardened robots.txt parsing for groups, allow/disallow priority, wildcard basics, and crawl-delay.
- Added docs/SOURCE_PROFILE.md and check:crawler guard.

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

## 0.4.0 - BE crawler job upgrade

- Added clean crawler job API: `POST /api/crawl/jobs`, `GET /api/crawl/jobs`, `GET /api/crawl/jobs/:id`.
- Added `GET /api/novels/:id/chapters`.
- Added crawler presentation layer and `CreateCrawlJobUseCase`.
- Updated FE crawl/task calls to use `/api/crawl/jobs`.
- Fixed `ClockPort` to return `Date` consistently.

## 0.4.1 - Shared dev runtime fix

- Fixed Termux/dev startup error where `@novel-tool/shared/dist/index.js` was missing.
- Added root `build:shared` script.
- Updated API/Web dev/build/check scripts to build shared before running.
- Added `docs/backend/BE_DEVELOPMENT_UPGRADE_003.md` with Termux recovery steps.

## 0.4.1 - Mobile native viewport fix

- Added proper mobile viewport meta tag to `apps/web/index.html`.
- Increased mobile-first typography, input height, CTA height, card spacing and bottom tab size.
- Converted recent tasks to list cards on all screen sizes to avoid table-like mobile rendering.
- Kept desktop breakpoints intact while making Android browser render at real device width.

## Mobile UI fix - bottom nav reserve and component cleanup

- Added shared layout components: `Stack` and `ResponsiveSplit`.
- Replaced page-level ad-hoc layout wrappers in `HomePage` with shared components.
- Increased mobile bottom navigation reserved height.
- Added extra safe-area bottom padding so `RecentTasks` is not hidden behind fixed tabs.
- Kept API architecture guard passing.

## Milestone 1 started - Core Crawler Platform

- Added crawler HTTP port/adapter.
- Added Cheerio HTML parser port/adapter.
- Added JSON source profile repository.
- Selector adapter now uses injected platform services instead of direct HTTP/parser imports.
- Robots policy now fetches `robots.txt` for allowlisted hosts.

## Milestone batch: data, resume, export, source management

- Added `POST /api/crawl/jobs/resume` to resume recoverable crawl jobs after app restart or Termux session interruption.
- Added `GET /api/crawl/sources` to list enabled JSON source profiles without exposing selectors.
- Added Markdown export format via `?format=md`.
- Kept SQLite-backed novels, chapters, and crawl task state as the resume/export foundation.

## 2026-07-15 — NovelCool proven fallback and chapter deduplication

- Restored the proven `body` text fallback when a configured chapter-content wrapper is absent from static HTML.
- Added canonical chapter deduplication so NovelCool URLs ending with `.html` and the equivalent URL without `.html` are treated as one chapter.
- Duplicate links now retain the more descriptive chapter title, preventing a synthetic `Chapter 1` entry from replacing the real chapter title.
- Added regression coverage for both behaviors.

## 2026-07-15 — Mobile design system rebuild

- Replaced the legacy cyan dashboard styling with a semantic dark-gray and indigo design system.
- Standardized color, typography, spacing, radius, elevation, touch targets, control heights, and safe-area dimensions.
- Rebuilt shared buttons, inputs, cards, list rows, badges, progress bars, headers, sections, and bottom navigation.
- Redesigned Crawl, Library, Reader, Tasks, and Settings for a consistent mobile-first hierarchy.
- Added chapter crawl error messages directly to failed chapter rows.
- Kept the NovelCool crawler fallback and URL deduplication behavior unchanged.

## Milestone 1.8 - Theme, localization, and reader hierarchy

- Added runtime System/Dark/Light themes with persisted preference.
- Added Vietnamese and English interface localization with persisted language selection.
- Rebuilt Settings as functional Appearance and Language controls.
- Flattened Reader Overview to remove nested cards and excessive mobile height.
- Localized primary navigation, core pages, chapter states, task states, and crawl actions.

## Milestone 1.10 - Flat UI polish and canonical chapter reconciliation

- Removed heavy card and bottom navigation elevation in favor of borders and tonal surfaces.
- Converted status badges to transparent outline-only semantic variants.
- Reduced mobile bottom navigation height to 64px and tightened navigation labels/icons.
- Localized dashboard stats, pagination, shared close/search labels, and novel URL field.
- Canonicalized chapter URLs across protocol/www/query/hash/.html and numeric chapter identifiers.
- Reconciled re-analysis by canonical chapter URL and removed stale duplicate database rows.

## Milestone 1.11 — UI Platform v2

- Flattened mobile surfaces and removed card elevation outside overlays.
- Added typed EN/VI locale dictionaries with compile-time key parity.
- Added System/Dark/Light settings and reader font, line-height, paragraph-spacing preferences.
- Added pre-mount theme initialization to avoid light/dark flash.
- Replaced direct palette colors in shared feedback/actions with semantic theme tokens.
- Added localized toasts, errors, status labels, task progress, dialogs and navigation accessibility copy.
- Added pure chapter candidate dedupe that removes generic `Chapter 1` duplicates by canonical numeric chapter ID.

## 2.0.0 - UI Platform v3

- Added Dark/Light/System themes with Indigo, Blue, Emerald and Amber accents.
- Added Compact and Comfortable density modes.
- Added Reader Pro typography, margins, alignment, indentation, hyphenation, drop cap, wake lock, auto-hiding chrome, keyboard and swipe chapter navigation.
- Added mobile BottomSheet export, accessible toast close actions and mobile dialog presentation.
- Added Library sorting/status filters, compact Crawl help and localized task number formatting.
- Added typed number, date, relative-time and plural i18n helpers.
- Added reduced-motion, focus, theme bootstrap and UI Platform regression audits.

## 2.0.3 - 2026-07-15

### Fixed

- Replaced 62 environment-specific OpenAI Artifactory URLs in `package-lock.json` with portable `registry.npmjs.org` URLs.
- Added `check:lockfile` to prevent internal registry hosts from being shipped again.
- Clarified that the `whatwg-encoding` deprecation warning is transitive and non-blocking.

## 2.0.2 - 2026-07-15

### Changed

- Replaced the shell-backgrounded development command with `concurrently` to remove startup races.
- Upgraded Vite and the React plugin to the current major line and cleared the npm security audit.
- Locked the supported runtime with `.nvmrc`, `engines`, and `packageManager` metadata.

### Added

- GitHub Actions verification for install, architecture checks, regression tests, API integration tests, builds, and Playwright E2E.
- API smoke integration coverage using isolated temporary SQLite storage.
- Mobile Chromium E2E navigation coverage for the primary application shell.
- A single `npm run verify` release gate.

## 2.1.0 - Mobile UI/UX upgrade

- Added Design System 2.0 token layers, shared surfaces, filter chips, query states and safe-area layout primitives.
- Split the regular application shell from the immersive Reader shell and standardized four-tab mobile navigation with task badge.
- Rebuilt Crawl and Tasks as operational dashboards with explicit status, summaries and mobile filters.
- Upgraded Library cards and Reader controls, chapter sheet, preferences sheet and versioned local reading-position restore.
- Expanded Settings with capability-backed crawler and storage information.
- Added UI upgrade specifications, state/capability matrices, accessibility rules and performance baseline documentation.
- Removed duplicated Shared builds from workspace dev scripts while preserving Termux-safe direct Node invocation for Vite.
