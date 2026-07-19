# Crawl Telemetry Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add persisted crawl telemetry, graceful pause/resume, chapter logs, and restart-to-paused recovery.

**Architecture:** Extend the task aggregate for lifecycle and metric snapshots, persist append-only crawl events through a separate repository, and keep runtime coordination inside `CrawlQueueService`. Controllers delegate to focused use cases and the web UI consumes only shared API types.

**Tech Stack:** TypeScript, Express, node:sqlite, React, TanStack Query, Zod.

## Global Constraints
- Active chapter requests finish before pause takes effect.
- Restart converts queued/running/pausing/resuming jobs to paused.
- No fabricated speed, ETA, or timeline entries in the frontend.
- Existing API and crawl behavior remain backward compatible.

---

### Task 1: Domain and persistence
- [x] Extend shared and API task status/metrics types.
- [x] Add crawl event entity, repository, mapper, SQLite table and indexes.
- [x] Add schema migration columns with backward-compatible ALTER statements.

### Task 2: Queue lifecycle
- [x] Add graceful pause and explicit resume to `CrawlQueuePort`.
- [x] Persist lifecycle/chapter events and metric snapshots in `CrawlQueueService`.
- [x] Ensure no worker starts a new chapter after pause is requested.

### Task 3: Use cases and HTTP API
- [x] Add pause, resume-one, list-events, and startup-recovery use cases.
- [x] Wire controller/routes/container.
- [x] Run startup recovery before accepting requests.

### Task 4: Web integration
- [x] Add API calls and polling for paused/pausing/resuming states and events.
- [x] Render current/average speed, ETA, paused duration, chapter timeline, pause/resume buttons.

### Task 5: Verification
- [x] Add regression/integration coverage for lifecycle contracts.
- [x] Run `npm run verify` and package a clean ZIP.
