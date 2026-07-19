# Apple Books Compact Screen Migration Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the principal web screens to the canonical Apple Books Compact primitives without changing route, lifecycle, data, or behavior.

**Architecture:** Shared UI primitives remain the only visual owners. Pages and feature widgets compose `Card`, `Panel`, `Chip`, `Toolbar`, `Section`, `ListRow`, `EmptyState`, and semantic `Text` roles. Compatibility wrappers remain available, but migrated screens use the canonical primitives directly.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, class-variance-authority, React Router, TanStack Query.

## Global Constraints

- Do not change backend contracts, routing, scroll ownership, Reader lifecycle, or persistence behavior.
- Keep minimum touch targets at 44px.
- Use only the Apple Books Compact typography, spacing, radius, icon, motion, and elevation tokens established in Phases 1 and 2.
- Preserve Vietnamese and English translations.

---

### Task 1: Add migration regression contract

**Files:**
- Create: `tests/regression/apple-books-screen-migration-phase-3.test.ts`

- [x] Assert principal screens compose canonical primitives and do not recreate card/status/toolbar recipes.

### Task 2: Migrate Crawl and Import surfaces

**Files:**
- Modify: `apps/web/src/pages/crawl/ui/CrawlPage.tsx`
- Modify: `apps/web/src/widgets/crawl-command/ui/CrawlCommandCard.tsx`
- Modify: `apps/web/src/widgets/crawl-task-card/ui/CrawlTaskCard.tsx`
- Modify: `apps/web/src/features/import-novel/ui/*.tsx`

- [x] Use Card composition, Section, EmptyState, Chip, IconTile, and semantic Text roles.

### Task 3: Migrate Library and Novel Detail

**Files:**
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`
- Modify: `apps/web/src/entities/novel/ui/NovelLibraryCard.tsx`
- Modify: `apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx`

- [x] Use canonical controls, status chips, cards/panels, and section hierarchy.

### Task 4: Migrate Tasks, Settings, and Reader chrome

**Files:**
- Modify: `apps/web/src/pages/tasks/ui/TasksPage.tsx`
- Modify: `apps/web/src/pages/task-detail/ui/TaskDetailPage.tsx`
- Modify: `apps/web/src/pages/settings/ui/*.tsx`
- Modify: `apps/web/src/widgets/reader-toolbar/ui/ReaderToolbar.tsx`
- Modify: `apps/web/src/widgets/reader-bottom-bar/ui/ReaderBottomBar.tsx`

- [x] Use canonical Toolbar, Card/Panel, Chip, ListRow, Text roles, and 20/24/32px icon scale.

### Task 5: Verify and package

- [x] Run architecture checks, format, TypeScript, regression, integration, and production builds.
- [x] Remove dependency/build artifacts and produce a clean ZIP.
