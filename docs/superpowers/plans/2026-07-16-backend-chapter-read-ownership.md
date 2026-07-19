# Backend Chapter Read Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chapters module the single owner of chapter reads while preserving existing API responses and crawl behavior.

**Architecture:** Novel persistence owns novel metadata and the transactional analyzed-novel upsert. The chapters module exposes an application-level catalog service; novels consumes it through a local `NovelChapterPort`, so no bounded context imports another bounded context directly. Novel detail composition moves to application services instead of the novel repository.

**Tech Stack:** TypeScript, Express, Node SQLite, npm workspaces, node:test.

## Global Constraints

- Preserve existing HTTP routes and response shapes.
- Preserve transactional novel analysis persistence.
- Do not add runtime dependencies.
- Cross-module communication must use consumer-owned ports wired in the composition root.

---

### Task 1: Define chapter catalog boundary
- [ ] Add `NovelChapterPort` in the novels application layer.
- [ ] Add a chapter module application service exposing chapter reads.
- [ ] Export the catalog service through the chapter module API.

### Task 2: Remove chapter reads from novel persistence
- [ ] Change `NovelRepository.findById` and `findBySourceUrl` to return only `Novel`.
- [ ] Remove `findChapter` and `updateChapter` from `NovelRepository` and `NovelSqliteRepository`.
- [ ] Keep analyzed novel/chapter upsert transactional.

### Task 3: Compose novel details in application services
- [ ] Update analyze, update, detail, export, and crawl lifecycle services to consume `NovelChapterPort`.
- [ ] Wire the chapter catalog through the composition root.
- [ ] Preserve `NovelDetail` outputs for controllers, crawler, and export.

### Task 4: Enforce and verify
- [ ] Extend the API architecture guard to reject chapter read/update methods in `NovelRepository`.
- [ ] Update regression test fakes for separate novel and chapter ownership.
- [ ] Run architecture checks, TypeScript checks, regression/integration tests, and production build.
