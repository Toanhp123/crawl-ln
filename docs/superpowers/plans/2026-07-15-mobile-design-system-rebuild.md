# Mobile Design System Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the web UI around a unified dark-gray + indigo mobile-first design system with consistent color, typography, spacing, radius, elevation, component sizing, and page hierarchy.

**Architecture:** Keep the current FSD boundaries and React Router page structure. Centralize visual decisions in semantic CSS tokens and shared UI primitives, then refactor page and entity compositions to consume those primitives rather than bespoke Tailwind values.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3, class-variance-authority, Lucide React, React Router DOM.

## Global Constraints

- Default appearance is dark gray, not AMOLED black.
- Primary accent is indigo.
- Mobile-first touch targets are at least 44px.
- Bottom navigation must respect Android safe-area and never obscure page content.
- Reader chapter view remains distraction-free and outside the main app shell.
- Settings remains intentionally empty.
- Preserve all crawler behavior and API contracts.

---

### Task 1: Semantic foundation tokens

**Files:**
- Modify: `apps/web/src/shared/theme/colors.css`
- Modify: `apps/web/src/shared/theme/spacing.css`
- Modify: `apps/web/src/shared/theme/radius.css`
- Modify: `apps/web/src/shared/theme/typography.css`
- Modify: `apps/web/src/shared/theme/shadows.css`
- Modify: `apps/web/src/shared/theme/size.css`
- Modify: `apps/web/src/app/styles/index.css`

- [ ] Replace the legacy cyan palette with semantic dark-gray surfaces and indigo accent tokens.
- [ ] Define one 4px spacing scale, one radius scale, one type scale, and four elevation levels.
- [ ] Define app, page, control, navigation, and reader dimensions from tokens.
- [ ] Verify the stylesheet imports compile through the web type-check/build commands.

### Task 2: Shared primitives and layout

**Files:**
- Modify: `apps/web/src/shared/ui/actions/Button.tsx`
- Modify: `apps/web/src/shared/ui/actions/IconButton.tsx`
- Modify: `apps/web/src/shared/ui/actions/ActionBar.tsx`
- Modify: `apps/web/src/shared/ui/forms/Input.tsx`
- Modify: `apps/web/src/shared/ui/layout/Card.tsx`
- Modify: `apps/web/src/shared/ui/layout/Page.tsx`
- Modify: `apps/web/src/shared/ui/layout/PageHeader.tsx`
- Modify: `apps/web/src/shared/ui/layout/Section.tsx`
- Modify: `apps/web/src/shared/ui/data-display/ListItem.tsx`
- Modify: `apps/web/src/shared/ui/feedback/Badge.tsx`
- Modify: `apps/web/src/shared/ui/feedback/Progress.tsx`
- Modify: `apps/web/src/shared/ui/navigation/BottomNav.tsx`

- [ ] Normalize control heights, text styles, radius, focus, disabled, pressed, and surface states.
- [ ] Make Page and PageHeader the single source of page spacing and hierarchy.
- [ ] Make cards, list items, badges, and progress indicators use semantic surfaces and status colors.
- [ ] Keep mobile bottom navigation compact, safe-area aware, and visibly separated from content.

### Task 3: App chrome and mobile navigation

**Files:**
- Modify: `apps/web/src/widgets/app-header/ui/AppHeader.tsx`
- Modify: `apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx`
- Modify: `apps/web/src/app/layouts/AppShell.tsx`

- [ ] Rebuild the header around a compact native-app identity treatment.
- [ ] Standardize active and inactive tab states with an indigo indicator.
- [ ] Ensure the outlet owns the full scroll area and reserves bottom navigation space exactly once.

### Task 4: Page compositions

**Files:**
- Modify: `apps/web/src/pages/crawl/ui/CrawlPage.tsx`
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`
- Modify: `apps/web/src/pages/reader/ui/ReaderPage.tsx`
- Modify: `apps/web/src/pages/tasks/ui/TasksPage.tsx`
- Modify: `apps/web/src/pages/settings/ui/SettingsPage.tsx`
- Modify: `apps/web/src/features/analyze-novel/ui/AnalyzeNovelForm.tsx`

- [ ] Recompose Crawl as one primary action surface plus concise stats and capability rows.
- [ ] Recompose Library around a sticky search surface and clean novel rows.
- [ ] Recompose Reader overview around novel status, actions, and chapter list hierarchy.
- [ ] Recompose chapter reading with book-like typography and unobtrusive navigation controls.
- [ ] Recompose Tasks as a download-manager list with segmented filtering.
- [ ] Keep Settings visually complete but functionally empty.

### Task 5: Entity and widget patterns

**Files:**
- Modify: `apps/web/src/entities/novel/ui/NovelCard.tsx`
- Modify: `apps/web/src/entities/chapter/ui/ChapterList.tsx`
- Modify: `apps/web/src/entities/chapter/ui/ChapterReader.tsx`
- Modify: `apps/web/src/widgets/mobile-library/ui/MobileLibrary.tsx`
- Modify: `apps/web/src/widgets/task-list/ui/TaskList.tsx`
- Modify: `apps/web/src/widgets/dashboard-stats/ui/DashboardStats.tsx`

- [ ] Standardize novel rows, chapter rows, task rows, and stat tiles.
- [ ] Display chapter failure messages in the chapter list when present.
- [ ] Use consistent icon containers, status badges, metadata lines, and divider rhythm.

### Task 6: Verification and packaging

**Files:**
- Modify: `CHANGELOG.md`
- Create: final ZIP artifact

- [ ] Run `npm run check -w @novel-tool/web`.
- [ ] Run `npm run build -w @novel-tool/web`.
- [ ] Confirm crawler regression tests still pass.
- [ ] Confirm no build output or `node_modules` is included in the ZIP.
- [ ] Package the project as `novel-tool-milestone1.7-design-system.zip`.
