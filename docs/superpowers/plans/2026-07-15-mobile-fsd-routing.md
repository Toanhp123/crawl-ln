# Mobile FSD Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single HomePage UI with route-backed mobile-first pages and a focused contextual reader.

**Architecture:** Add React Router at the app layer, split page-specific query composition into dedicated page models, and reuse existing entity/feature UI where practical. Route params own selected novel/chapter state; the main app shell owns four-tab navigation while chapter reading uses a focused layout.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Tailwind CSS, react-router-dom, lucide-react.

## Global Constraints
- Keep backend and API contracts unchanged.
- Main mobile navigation has Crawl, Library, Tasks, Settings only.
- Analyze success navigates to `/reader/:novelId`.
- Library item selection navigates to `/reader/:novelId`.
- Settings remains an honest empty state.
- Mobile touch targets are at least 44px and safe-area aware.

---

### Task 1: Routing and shell
**Files:** Modify package metadata, `main.tsx`, router, shell, bottom navigation, shared navigation.
- [ ] Add `react-router-dom`.
- [ ] Mount `BrowserRouter` and nested routes.
- [ ] Make bottom tabs route-aware and hide them on chapter routes.
- [ ] Run TypeScript check.

### Task 2: Crawl and Library pages
**Files:** Create `pages/crawl`, `pages/library`; update analyze mutation callback; create mobile library list widget.
- [ ] Compose Crawl page with analyze form and stats.
- [ ] Navigate to Reader after successful analyze.
- [ ] Compose searchable Library page and navigate on selection.
- [ ] Run TypeScript check.

### Task 3: Reader pages
**Files:** Create reader page model/UI and focused chapter controls; adapt chapter reader/list interfaces.
- [ ] Load novel/task by route id.
- [ ] Render novel overview, actions, progress, chapters.
- [ ] Load chapter by route index and add previous/next navigation.
- [ ] Hide main bottom navigation in chapter mode.
- [ ] Run TypeScript check.

### Task 4: Tasks and Settings pages
**Files:** Create tasks model/UI and settings UI.
- [ ] Add task filters and mobile task list.
- [ ] Add empty Settings page.
- [ ] Run TypeScript check.

### Task 5: Cleanup and verification
**Files:** Remove HomePage composition and obsolete dashboard-only widgets where unused; tune global mobile styles.
- [ ] Remove dead imports/files without crossing FSD boundaries.
- [ ] Run `npm run check -w @novel-tool/web`.
- [ ] Run `npm run build -w @novel-tool/web`.
- [ ] Package the updated source.
