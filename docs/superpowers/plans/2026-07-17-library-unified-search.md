# Library Unified Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone Search destination and integrate novel and chapter-content search into Library.

**Architecture:** Library owns the active search scope and shared query text. Existing server-side novel listing remains the default scope, while the existing FTS search feature renders chapter matches only when the user selects Content. The standalone page, route, and navigation entries are deleted.

**Tech Stack:** React, React Router, TanStack Query, TypeScript, FSD, Node test runner.

## Global Constraints

- Do not change backend search APIs or database schema.
- Keep Library server-side pagination for novel results.
- Only call FTS while the Content scope is active and the query is non-empty.
- Preserve safe snippet rendering without `dangerouslySetInnerHTML`.
- Remove the `/search` route and all primary navigation links to it.

---

### Task 1: Lock the unified-search behavior with regression coverage

**Files:**

- Modify: `tests/regression/search-engine-ui.test.ts`
- Create: `tests/regression/library-unified-search.test.ts`

- [ ] Assert `/search` is absent from router and navigation.
- [ ] Assert Library renders Novels and Content scopes.
- [ ] Assert content results use the existing FTS hook and safe highlighting.

### Task 2: Add content-search results inside Library

**Files:**

- Create: `apps/web/src/features/search-library/ui/LibraryContentSearch.tsx`
- Modify: `apps/web/src/pages/library/model/useLibraryPage.ts`
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`

- [ ] Add Library-owned `searchScope` state.
- [ ] Render existing novel cards in Novels scope.
- [ ] Render chapter FTS results in Content scope.
- [ ] Add pagination, loading, empty, and error states for content results.
- [ ] Offer a one-click switch to Content when novel search has no matches.

### Task 3: Remove standalone Search navigation and route

**Files:**

- Modify: `apps/web/src/app/router/AppRouter.tsx`
- Modify: `apps/web/src/widgets/app-header/ui/AppHeader.tsx`
- Modify: `apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx`
- Delete: `apps/web/src/pages/search/ui/SearchPage.tsx`

- [ ] Remove lazy import and route.
- [ ] Remove desktop and mobile navigation entries.
- [ ] Ensure the four remaining destinations are Import, Library, Tasks, Settings.

### Task 4: Update copy and verify

**Files:**

- Modify: `apps/web/src/shared/i18n/locales/en.ts`
- Modify: `apps/web/src/shared/i18n/locales/vi.ts`

- [ ] Add unified Library search labels and content-specific empty text.
- [ ] Run architecture checks, formatting, TypeScript, regression, integration, and production builds.
