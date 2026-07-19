# FSD Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce frontend Feature-Sliced Design dependency direction and remove the five existing boundary violations without changing runtime behavior.

**Architecture:** Add a static import-boundary guard for FSD layers and same-layer slices. Move ownership of filter types and task API calls to their owning slices, keep shared utilities domain-agnostic, and move chapter paragraph identifiers into the chapter entity.

**Tech Stack:** Node.js ESM scripts, TypeScript, React, Vite, TanStack Query.

## Global Constraints

- Preserve all HTTP endpoints, query-key values, UI behavior, and persisted reader anchor IDs.
- Do not introduce new runtime dependencies.
- Limit refactoring to frontend dependency boundaries and public APIs for touched slices.

---

### Task 1: Add an FSD architecture guard

**Files:**
- Create: `scripts/check-web-architecture.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run check:web-arch`, failing on upward layer imports or cross-slice imports within `pages`, `widgets`, `features`, and `entities`.

- [ ] Write the guard and add the npm script.
- [ ] Run it and confirm it fails on the five known violations.
- [ ] Keep the guard focused on dependency direction; public API enforcement is limited to touched imports in this batch.

### Task 2: Repair shared and entity ownership

**Files:**
- Modify: `apps/web/src/shared/api/queryKeys.ts`
- Modify: `apps/web/src/entities/novel/api/novelApi.ts`
- Modify: `apps/web/src/entities/task/api/taskApi.ts`
- Modify: `apps/web/src/pages/novel-detail/model/useNovelDetailPage.ts`
- Create: `apps/web/src/entities/task/index.ts`

**Interfaces:**
- Produces: `getNovelTask(novelId: string): Promise<CrawlTask | null>` from the task entity.

- [ ] Make shared query keys accept domain-neutral serializable options without importing an entity.
- [ ] Move `getNovelTask` from the novel entity to the task entity.
- [ ] Update the page import through the task slice public API.

### Task 3: Repair feature and chapter ownership

**Files:**
- Create: `apps/web/src/features/filter-library/model/types.ts`
- Create: `apps/web/src/features/filter-library/index.ts`
- Modify: `apps/web/src/features/filter-library/ui/LibraryControlsSheet.tsx`
- Modify: `apps/web/src/pages/library/model/useLibraryPage.ts`
- Create: `apps/web/src/features/filter-tasks/model/types.ts`
- Create: `apps/web/src/features/filter-tasks/index.ts`
- Modify: `apps/web/src/features/filter-tasks/ui/TaskFilterBar.tsx`
- Modify: `apps/web/src/pages/tasks/model/taskDashboard.ts`
- Modify: `apps/web/src/pages/tasks/model/useTasksPage.ts`
- Modify: `apps/web/src/pages/tasks/ui/TasksPage.tsx`
- Create: `apps/web/src/entities/chapter/lib/paragraphDomId.ts`
- Create: `apps/web/src/entities/chapter/index.ts`
- Modify: `apps/web/src/entities/chapter/ui/ChapterReader.tsx`
- Modify: `apps/web/src/features/read-chapter/model/readingAnchor.ts`

**Interfaces:**
- Produces: `LibrarySort`, `LibraryFilter`, `TaskFilter`, and `paragraphDomId` from their owning slices.

- [ ] Move filter types from pages into feature model files and consume through public APIs.
- [ ] Move paragraph DOM ID generation into the chapter entity and re-export it.
- [ ] Preserve the exact ID format used by reading-anchor restoration.

### Task 4: Verify and package

**Files:**
- Modify only if formatting requires it.

**Interfaces:**
- Consumes: all changes above.
- Produces: a source archive with passing architecture and available regression checks.

- [ ] Run `npm run check:web-arch` and `npm run check:web-contracts`.
- [ ] Run TypeScript checks when dependencies are available; otherwise report the precise environment blocker.
- [ ] Scan the import graph independently to confirm no upward or same-layer cross-slice violations remain.
- [ ] Package the modified source as a ZIP archive.
