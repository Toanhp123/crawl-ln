# Incremental Update and Durable Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-click incremental novel updates and make crawl resume consume a durable task chapter snapshot.

**Architecture:** Reuse `AnalyzeNovelUseCase` for URL-based metadata synchronization, add `UpdateNovelUseCase` to compare chapter sets and optionally queue pending work, and persist chapter IDs alongside each crawl task. Queue processing uses the persisted IDs with a backward-compatible fallback for old tasks.

**Tech Stack:** TypeScript, Express, React, TanStack Query, Node SQLite, Node test runner.

## Global Constraints
- Do not add runtime dependencies.
- Preserve fetched chapter content and IDs when a source is re-analyzed.
- Existing SQLite databases must migrate automatically.
- Existing tasks created before this feature must remain resumable.
- Windows, Linux, and Termux scripts must remain portable.

---

### Task 1: Persist crawl task plans
- [ ] Add a `chapter_ids_json` migration to `crawl_tasks`.
- [ ] Extend `TaskRepository.create` and `findChapterIds`.
- [ ] Save the pending chapter snapshot when creating a task.
- [ ] Make the queue use the snapshot with a legacy fallback.

### Task 2: Incremental update use case and API
- [ ] Add tests for new chapters and already-up-to-date novels.
- [ ] Implement `UpdateNovelUseCase`.
- [ ] Add `POST /novels/:id/update` to controller, routes, and container.

### Task 3: Novel Detail update action
- [ ] Add web API and TanStack mutation.
- [ ] Add localized Update action and outcome notifications.
- [ ] Invalidate novel, novels, stats, tasks, and novel-task queries.

### Task 4: Verification
- [ ] Run architecture and crawler checks.
- [ ] Run TypeScript checks.
- [ ] Run regression and integration tests.
- [ ] Run production build and package clean source.
