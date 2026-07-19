# Startup Layout Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove startup and background-refresh layout jumps without blocking the whole app on global data loading.

**Architecture:** Keep the application shell mounted while lazy route content loads, make root navigation synchronous, and reserve stable space for Library hero/card placeholders. Keep changes inside existing FSD layers and avoid new dependencies.

**Tech Stack:** React, React Router, TanStack Query, Tailwind CSS, Node test runner.

## Global Constraints

- Preserve current FSD boundaries.
- Do not add animation or data-fetching dependencies.
- Keep background refresh manual or mutation-driven for Library.
- Preserve reduced-motion behavior already implemented.

---

### Task 1: Library focus policy

**Files:**
- Modify: `apps/web/src/pages/library/model/useLibraryPage.ts`
- Test: `apps/web/tests/startup-layout-stability.test.mjs`

- [x] Add a failing source-contract test requiring `refetchOnWindowFocus: false`.
- [x] Run the test and confirm it fails on the previous implementation.
- [x] Disable Library refetch on focus.
- [x] Run the regression test and confirm it passes.

### Task 2: Stable route shell

**Files:**
- Modify: `apps/web/src/app/router/AppRouter.tsx`
- Modify: `apps/web/src/app/layouts/AppShell.tsx`
- Test: `apps/web/tests/startup-layout-stability.test.mjs`

- [x] Add a failing test requiring the Suspense boundary inside `AppShell`.
- [x] Move route loading fallback around `Outlet` so header and bottom tabs stay mounted.
- [x] Run the regression test and confirm it passes.

### Task 3: Synchronous home redirect

**Files:**
- Modify: `apps/web/src/app/router/HomeRedirect.tsx`
- Test: `apps/web/tests/startup-layout-stability.test.mjs`

- [x] Add a failing test forbidding startup query dependencies.
- [x] Replace API-driven redirect with synchronous navigation to `/library`.
- [x] Run the regression test and confirm it passes.

### Task 4: Stable Continue Reading region

**Files:**
- Modify: `apps/web/src/pages/library/model/useLibraryPage.ts`
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`
- Modify: `apps/web/src/widgets/continue-reading/ui/ContinueReadingHero.tsx`
- Test: `apps/web/tests/startup-layout-stability.test.mjs`

- [x] Expose primary reading entry and its query state from the page model.
- [x] Render a dimension-matched hero skeleton while the novel detail loads.
- [x] Give the real hero the same minimum height.
- [x] Run the regression test and confirm it passes.

### Task 5: Library card skeleton parity

**Files:**
- Modify: `apps/web/src/pages/library/model/useLibraryPage.ts`
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`
- Modify: `apps/web/src/entities/novel/ui/NovelLibraryCard.tsx`
- Test: `apps/web/tests/startup-layout-stability.test.mjs`

- [x] Export the Library page size constant.
- [x] Render the same number of skeleton cards as a full page.
- [x] Mirror cover, metadata, status, progress, and action regions.
- [x] Use the same minimum card height for skeleton and real cards.
- [x] Run all web regression and FSD architecture checks.
