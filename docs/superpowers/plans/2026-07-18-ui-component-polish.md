# UI Component Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five mobile UI issues confirmed by screenshots without changing route, data, or lifecycle behavior.

**Architecture:** Keep the existing Apple Books Compact primitives. Fix scroll ownership in the shared `BottomSheet`; keep feature-specific composition in Settings, Crawl, Novel Detail, and Library; use existing 44px touch-target tokens for search/filter controls.

**Tech Stack:** React, TypeScript, Tailwind CSS, Radix Dialog, Node test runner.

## Global Constraints

- Preserve touch targets at 44px or larger.
- Do not change Reader persistence, navigation, or server behavior.
- Keep all typography on semantic `type-*` classes.
- Add regression contracts before implementation.

---

### Task 1: Add regression contracts

**Files:**
- Create: `tests/regression/ui-component-polish.test.ts`

- [ ] Assert BottomSheet is a constrained flex column with a scroll-owned body.
- [ ] Assert Settings hub rows vertically center icon/content/trailing action.
- [ ] Assert Crawl and Novel Detail actions use a single horizontal row.
- [ ] Assert Library progress is separated from the action footer.
- [ ] Assert Library search and filter controls use the 44px touch target and a square IconButton.

### Task 2: Fix shared BottomSheet scroll ownership

**Files:**
- Modify: `apps/web/src/shared/ui/overlay/BottomSheet.tsx`

- [ ] Make the sheet a flex column constrained by dynamic viewport height.
- [ ] Keep handle/header shrinkable only by explicit rules.
- [ ] Give content `min-h-0 flex-1 overflow-y-auto overscroll-contain`.

### Task 3: Align Settings cards and action rows

**Files:**
- Modify: `apps/web/src/pages/settings/ui/SettingsHubCard.tsx`
- Modify: `apps/web/src/features/import-novel/ui/NovelPreviewCard.tsx`
- Modify: `apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx`
- Modify: `apps/web/src/pages/novel-detail/ui/NovelManagementSheet.tsx`

- [ ] Center Settings row content vertically.
- [ ] Keep Crawl preview primary/secondary actions on one row.
- [ ] Keep Novel Detail read/manage actions on one row with truncation-safe primary text.

### Task 4: Refine Library progress and controls

**Files:**
- Modify: `apps/web/src/entities/novel/ui/NovelLibraryCard.tsx`
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`
- Modify: `apps/web/src/shared/ui/forms/SearchInput.tsx`

- [ ] Add a 12px separation between progress content and card footer.
- [ ] Make search exactly the canonical 44px touch target.
- [ ] Render filter as a square `IconButton`, with count badge overlaid when active.

### Task 5: Verify and package

- [ ] Run formatting, architecture checks, TypeScript, regression, integration, and production build.
- [ ] Remove dependencies and generated output from the handoff archive.
