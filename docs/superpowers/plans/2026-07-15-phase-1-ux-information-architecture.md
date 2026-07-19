# Phase 1 UX Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Separate page responsibilities and make the primary flow Crawl → Tasks → Library → Novel Detail → Chapter Reader explicit and consistent.

**Architecture:** Keep existing entities/features and split page-level orchestration. Move task detail into its own page slice, split the combined reader page into novel-detail and chapter-reader slices, and simplify Crawl so task management lives in Tasks. Preserve backward-compatible redirects for old URLs.

**Tech Stack:** React 18, TypeScript, React Router, TanStack Query, Tailwind CSS, existing FSD structure.

## Global Constraints

- Preserve current API contracts and reading continuity storage format.
- Preserve mobile-first behavior, safe areas, reader gestures, wake lock, bookmarks, and progress restoration.
- Use existing shared UI primitives and semantic theme tokens.
- Keep old `/crawl/tasks/:taskId` and `/reader/:novelId` links working via redirects.
- Do not add dependencies.

---

### Task 1: Route and task-detail ownership

**Files:**
- Create: `apps/web/src/pages/task-detail/model/useTaskDetailPage.ts`
- Create: `apps/web/src/pages/task-detail/ui/TaskDetailPage.tsx`
- Modify: `apps/web/src/app/router/AppRouter.tsx`
- Modify: task-link producers in widgets/pages

**Interfaces:**
- Produces route `/tasks/:taskId` and backward redirect from `/crawl/tasks/:taskId`.
- Produces `useTaskDetailPage()` with the same behavior as the current task-detail model.

- [x] Copy the task detail model/UI into a dedicated page slice and rename exports.
- [x] Update all task detail navigation to `/tasks/:taskId`.
- [x] Add a legacy redirect component for old task URLs.
- [x] Run web TypeScript check.

### Task 2: Split novel detail from chapter reader

**Files:**
- Create: `apps/web/src/pages/novel-detail/model/useNovelDetailPage.ts`
- Create: `apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx`
- Create: `apps/web/src/pages/chapter-reader/model/useChapterReaderPage.ts`
- Create: `apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx`
- Modify: `apps/web/src/app/router/AppRouter.tsx`
- Modify: novel-opening links throughout web
- Remove after verification: `apps/web/src/pages/reader/*`

**Interfaces:**
- Novel detail route: `/library/:novelId`.
- Chapter route remains `/reader/:novelId/:chapterIndex`.
- Legacy `/reader/:novelId` redirects to `/library/:novelId`.

- [x] Extract overview-only query/mutations/navigation into `useNovelDetailPage`.
- [x] Extract chapter-only query/prefetch/navigation into `useChapterReaderPage`.
- [x] Move overview JSX to `NovelDetailPage`.
- [x] Move reader JSX and continuity effects to `ChapterReaderPage`.
- [x] Update route imports and all novel detail links.
- [x] Run web TypeScript check and build.

### Task 3: Simplify Crawl responsibility

**Files:**
- Modify: `apps/web/src/pages/crawl/model/useCrawlPage.ts`
- Modify: `apps/web/src/pages/crawl/ui/CrawlPage.tsx`
- Modify: `apps/web/src/widgets/crawl-command/ui/CrawlCommandCard.tsx` if needed

**Interfaces:**
- Crawl page remains `/crawl`.
- Crawl shows creation command, at most two recent tasks, and a direct “view all tasks” path.

- [x] Remove task filters and dashboard summary from Crawl.
- [x] Limit recent task display to two active/recent items.
- [x] Keep help and clear route to Tasks.
- [x] Run web TypeScript check.

### Task 4: Make Tasks the management center

**Files:**
- Modify: `apps/web/src/pages/tasks/model/taskDashboard.ts`
- Modify: `apps/web/src/pages/tasks/model/useTasksPage.ts`
- Modify: `apps/web/src/features/filter-tasks/ui/TaskFilterBar.tsx`
- Modify: `apps/web/src/pages/tasks/ui/TasksPage.tsx`
- Modify: `apps/web/src/widgets/task-list/ui/TaskList.tsx`

**Interfaces:**
- Filters become `all | active | completed | failed`.
- Active includes queued, running, pausing, paused, and resuming.

- [x] Replace technical status filters with user-facing groups.
- [x] Put active task content before summary.
- [x] Ensure task rows link to `/tasks/:taskId` and expose state-appropriate labels/actions where supported.
- [x] Run web TypeScript check and build.

### Task 5: Full verification and package

**Files:**
- Modify: documentation only if route references are stale.

- [x] Run `npm run check -w apps/web`.
- [x] Run `npm run build -w apps/web`.
- [x] Run project regression tests where dependencies/environment allow.
- [x] Search for stale `/crawl/tasks/` and overview `/reader/:novelId` links.
- [x] Create a new ZIP containing the completed Phase 1 source.
