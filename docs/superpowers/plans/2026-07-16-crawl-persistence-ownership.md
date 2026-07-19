# Crawl Persistence Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove cross-aggregate SQL ownership from crawler infrastructure while preserving atomic crawl progress transactions.

**Architecture:** Each owning module provides a focused SQLite writer for its own aggregate. An application-level SQLite unit of work coordinates those writers inside one transaction and implements the crawler-owned `CrawlPersistencePort`.

**Tech Stack:** TypeScript, Node.js SQLite, npm workspaces, Node test runner.

## Global Constraints

- Preserve API and runtime behavior.
- Preserve atomic chapter/task and task/novel updates.
- Crawler infrastructure must not write `chapters`, `crawl_tasks`, or `novels`.
- Do not expose repositories across bounded contexts.

---

### Task 1: Add the failing ownership regression

**Files:**
- Create: `tests/regression/crawl-persistence-ownership.test.ts`

- [x] Assert that the legacy crawler SQLite adapter is absent.
- [x] Assert that the composition root uses `CrawlRunSqliteUnitOfWork` with module-owned writers.
- [x] Assert that the coordinator contains no aggregate SQL statements.
- [x] Run the test and verify it fails against Phase 3.

### Task 2: Introduce module-owned crawl writers

**Files:**
- Create: `apps/api/src/modules/chapters/infrastructure/sqlite/chapter-crawl-sqlite.writer.ts`
- Create: `apps/api/src/modules/task/infrastructure/sqlite/task-crawl-sqlite.writer.ts`
- Create: `apps/api/src/modules/novels/infrastructure/sqlite/novel-crawl-sqlite.writer.ts`
- Modify: corresponding module factories.

- [x] Give each writer one aggregate-specific `update` method.
- [x] Expose writers only through module composition metadata.

### Task 3: Add the application transaction coordinator

**Files:**
- Create: `apps/api/src/shared/database/crawl-run-sqlite.unit-of-work.ts`
- Modify: `apps/api/src/shared/container/modules/crawler.module.ts`
- Modify: `apps/api/src/shared/container/app-container.ts`
- Delete: `apps/api/src/modules/crawler/infrastructure/sqlite/crawl-persistence-sqlite.adapter.ts`

- [x] Implement `CrawlPersistencePort` without embedding table SQL.
- [x] Preserve transaction boundaries for start, chapter result, and final state.
- [x] Compose module-owned writers in the application composition root.

### Task 4: Protect and verify the boundary

**Files:**
- Modify: `scripts/check-api-architecture.mjs`
- Modify: `tests/integration/sqlite-transaction.test.ts`

- [x] Reject crawler SQLite files that update foreign aggregate tables.
- [x] Run regression and integration transaction coverage.
- [x] Run architecture, format, type, and production build checks.
