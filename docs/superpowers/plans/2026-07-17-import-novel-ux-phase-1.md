# Import Novel UX Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crawl landing page's disconnected analyze/task experience with a single-screen import wizard covering URL entry, preview, live progress, activity, completion, and actionable errors.

**Architecture:** The crawl page owns orchestration because it composes the existing analyze-novel and crawl-novel features. A new `features/import-novel` slice owns presentation-only components and progress formatting helpers; it does not import sibling features. Existing backend endpoints and transport contracts remain unchanged.

**Tech Stack:** React, TypeScript, TanStack Query, React Router, Tailwind utilities, existing shared UI and i18n.

## Global Constraints

- Preserve current backend API contracts.
- Preserve FSD dependency direction and pass `check:web-arch`.
- Use existing task polling and crawl-event endpoints.
- Do not redesign Library, Reader, Settings, Backup, or Plugins.
- Keep all user-visible copy in both English and Vietnamese dictionaries.

---

### Task 1: Import flow model and regression contract

**Files:**

- Create: `apps/web/src/features/import-novel/model/import-progress.ts`
- Create: `apps/web/src/features/import-novel/index.ts`
- Create: `tests/regression/import-novel-ux-flow.test.ts`
- Modify: `apps/web/src/pages/crawl/model/useCrawlPage.ts`

**Interfaces:**

- Produces `ImportFlowStage`, `progressPercent`, `formatDuration`, and `friendlyTaskStage`.
- Produces page model fields for analyzed novel, created task, task events, retry/reset actions, and current stage.

- [ ] Write a source-level regression test requiring a single-screen wizard, task/event polling, ETA display, completion actions, and no analyze-success navigation.
- [ ] Run the targeted regression test and confirm it fails.
- [ ] Add progress helpers and page orchestration using existing feature hooks and task APIs.
- [ ] Run TypeScript and targeted regression test.

### Task 2: Wizard UI states

**Files:**

- Create: `apps/web/src/features/import-novel/ui/ImportNovelWizard.tsx`
- Create: `apps/web/src/features/import-novel/ui/AnalyzeSkeleton.tsx`
- Create: `apps/web/src/features/import-novel/ui/NovelPreviewCard.tsx`
- Create: `apps/web/src/features/import-novel/ui/ImportProgressCard.tsx`
- Create: `apps/web/src/features/import-novel/ui/ImportTimeline.tsx`
- Create: `apps/web/src/features/import-novel/ui/CompletionCard.tsx`
- Create: `apps/web/src/features/import-novel/ui/ImportErrorCard.tsx`
- Modify: `apps/web/src/pages/crawl/ui/CrawlPage.tsx`

**Interfaces:**

- Consumes only entities/shared types and callbacks supplied by the page.
- Produces a single adaptive card for idle, analyzing, preview, importing, completed, and error states.

- [ ] Add preview, skeleton, progress, activity, completion, and error components.
- [ ] Replace the old command card on `CrawlPage` with `ImportNovelWizard`.
- [ ] Keep recent tasks and help sections below the wizard.
- [ ] Run web architecture and TypeScript checks.

### Task 3: Mutation behavior and localization

**Files:**

- Modify: `apps/web/src/features/analyze-novel/model/useAnalyzeNovel.ts`
- Modify: `apps/web/src/shared/i18n/locales/en.ts`
- Modify: `apps/web/src/shared/i18n/locales/vi.ts`

**Interfaces:**

- `useAnalyzeNovel` accepts optional callbacks and no longer forces page navigation.
- Dictionaries expose all Phase 1 labels, stages, activity, errors, and completion copy.

- [ ] Change analyze success to remain on the crawl page and expose analyzed detail to orchestration.
- [ ] Add English and Vietnamese copy.
- [ ] Run format, TypeScript, and regression tests.

### Task 4: Full verification and archive

**Files:**

- Modify only files needed by verification fixes.

- [ ] Run `npm run check`.
- [ ] Run `npm run test:regression`.
- [ ] Run `npm run test:integration`.
- [ ] Run API and web production builds.
- [ ] Remove `node_modules`, `dist`, and `*.tsbuildinfo` from the delivery tree.
- [ ] Create and validate `novel-tool-v2.9.6-ux-phase-1.zip`.
