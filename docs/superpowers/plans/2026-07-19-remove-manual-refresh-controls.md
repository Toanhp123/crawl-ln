# Remove Manual Refresh Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove user-triggered data refresh controls now that SSE and automatic polling fallback keep data synchronized, while preserving explicit retry and business actions.

**Architecture:** Realtime SSE remains the primary invalidation path and React Query polling remains the disconnected fallback. UI pages stop exposing manual refresh actions or background refresh indicators; initial request failures retain explicit retry actions that call the same query `refetch()` methods.

**Tech Stack:** React 18, TypeScript, TanStack React Query, Node test runner, Prettier.

## Global Constraints

- Keep REST as the source of truth and SSE as the realtime invalidation channel.
- Preserve polling fallback when realtime is disconnected.
- Preserve Retry actions for actual load failures.
- Preserve business actions including plugin reload, novel update, crawl retry, and backup restore.
- Do not add layout-changing loading UI for background synchronization.

---

### Task 1: Lock the auto-sync UI contract

**Files:**
- Create: `tests/regression/web-auto-sync-controls.test.ts`
- Modify: `tests/regression/web-flow-hardening.test.ts`
- Modify: `apps/web/tests/task-refresh-stability.test.mjs`

**Interfaces:**
- Consumes: Page source files and shared UI exports.
- Produces: Regression rules that prohibit manual refresh controls while requiring error retry and business reload controls.

- [ ] **Step 1: Write failing regression tests**
- [ ] **Step 2: Run focused tests and confirm failure against current refresh controls**

### Task 2: Remove manual refresh controls from data pages

**Files:**
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`
- Modify: `apps/web/src/pages/library/model/useLibraryPage.ts`
- Modify: `apps/web/src/pages/crawl/ui/CrawlPage.tsx`
- Modify: `apps/web/src/pages/tasks/ui/TasksPage.tsx`
- Modify: `apps/web/src/pages/task-detail/ui/TaskDetailPage.tsx`
- Modify: `apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx`

**Interfaces:**
- Consumes: Existing SSE invalidation and polling fallback behavior.
- Produces: Pages without manual refresh buttons; Library and Task Detail retain failure retry callbacks.

- [ ] **Step 1: Remove PageHeader and toolbar refresh actions**
- [ ] **Step 2: Rename Library load recovery from `refresh` to `retryLoad`**
- [ ] **Step 3: Change Task Detail failure action copy from Reload to Retry**
- [ ] **Step 4: Run focused tests and TypeScript checks**

### Task 3: Remove obsolete refresh-indicator UI

**Files:**
- Delete: `apps/web/src/shared/ui/feedback/RefreshIndicator.tsx`
- Delete: `apps/web/src/shared/ui/feedback/SyncIndicator.tsx`
- Modify: `apps/web/src/shared/ui/index.ts`

**Interfaces:**
- Consumes: No remaining page references after Task 2.
- Produces: Shared UI surface without obsolete background refresh indicator components.

- [ ] **Step 1: Remove unused exports and files**
- [ ] **Step 2: Verify no refresh-indicator imports remain**

### Task 4: Verify and package

**Files:**
- Modify: formatting-only files when required by Prettier.

**Interfaces:**
- Consumes: Completed source and regression changes.
- Produces: Verified clean source archive.

- [ ] **Step 1: Run format check, TypeScript checks, regression tests, integration tests, and production build**
- [ ] **Step 2: Package source without `node_modules`, `dist`, storage, test output, or temporary databases**
