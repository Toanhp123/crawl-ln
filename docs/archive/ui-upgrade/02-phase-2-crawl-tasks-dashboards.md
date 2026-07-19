# Phase 2 Implementation Plan — Crawl and Tasks Operational Dashboards

> **Execution rule:** Implement task-by-task with red-green-refactor. Do not expose controls for API capabilities that do not exist.

**Goal:** Rebuild Crawl and Tasks as clear mobile operational dashboards using Phase 1 primitives while preserving crawler and task API contracts.

**Architecture:** Page models translate query/mutation state into display-ready view models. Widgets compose dashboard sections. Entities render reusable task/novel facts. Features own user actions such as analyze, crawl, filter, retry, and opening diagnostics.

**Tech stack:** Existing React Query mutations/queries, Phase 1 shared UI, React Router, TypeScript.

## Global constraints

- Do not change API payloads in this phase.
- Do not fabricate speed, ETA, rate-limit, pause, cancel, or retry capability.
- Existing analyze and crawl behavior must remain available.
- Successful data remains visible during background refresh.
- All errors must present a human message and an optional technical detail.
- All actions remain keyboard and touch accessible.

---

## Task 2.1 — Freeze operational dashboard behavior

**Files**
- Create: `tests/regression/crawl-dashboard-ui.test.ts`
- Create: `tests/regression/task-dashboard-ui.test.ts`
- Modify: `tests/e2e/app-shell.spec.ts`
- Create: `tests/e2e/crawl-dashboard.spec.ts`
- Create: `tests/e2e/tasks-dashboard.spec.ts`

**Test contracts**
- Crawl has exactly one primary URL entry region.
- Analyze result has explicit loading, ready, unsupported, and error states.
- Crawl action is disabled until a valid analyzed result permits it.
- Tasks group active work before history.
- Task state is not represented by color alone.
- Unsupported pause/cancel buttons are absent.
- Task progress has accessible names and values.

**Steps**
- [ ] Add failing structural regression checks for the required widgets and files.
- [ ] Add failing tests for task status mapping functions that do not yet exist.
- [ ] Add Playwright tests using route interception for analyze success, analyze failure, and tasks data.
- [ ] Run focused tests and confirm every failure is caused by missing Phase 2 behavior.
- [ ] Commit red tests before implementation.

**Acceptance**
Tests fail predictably without depending on live external novel sites.

---

## Task 2.2 — Create crawl dashboard view model

**Files**
- Create: `apps/web/src/pages/crawl/model/crawlDashboard.ts`
- Modify: `apps/web/src/pages/crawl/model/useCrawlPage.ts`
- Modify: `apps/web/src/entities/novel/model/types.ts` only when an existing API field needs a UI alias

**Interfaces**
```ts
export type CrawlDashboardStatus =
  | "idle"
  | "analyzing"
  | "ready"
  | "crawling"
  | "success"
  | "error";

export interface CrawlDashboardView {
  status: CrawlDashboardStatus;
  sourceUrl: string;
  canAnalyze: boolean;
  canCrawl: boolean;
  analyzedNovel: {
    title: string;
    sourceName?: string;
    chapterCount?: number;
  } | null;
  message?: string;
  technicalDetail?: string;
}
```

**Steps**
- [ ] Write pure unit tests for every state transition and capability flag.
- [ ] Run tests and verify the missing exports fail.
- [ ] Implement pure mapping helpers without React dependencies.
- [ ] Update `useCrawlPage` to expose one view model plus action callbacks.
- [ ] Preserve mutation reset and error semantics.
- [ ] Run regression and web type-check.
- [ ] Commit the model layer.

**Acceptance**
`CrawlPage` no longer reconstructs status rules from multiple mutation booleans.

---

## Task 2.3 — Rebuild URL command surface

**Files**
- Modify: `apps/web/src/features/analyze-novel/ui/AnalyzeNovelForm.tsx`
- Modify: `apps/web/src/features/crawl-novel/ui/CrawlNovelButton.tsx`
- Create: `apps/web/src/widgets/crawl-command/ui/CrawlCommandCard.tsx`
- Modify: `apps/web/src/pages/crawl/ui/CrawlPage.tsx`
- Modify translations:
  - `apps/web/src/shared/i18n/locales/en.ts`
  - `apps/web/src/shared/i18n/locales/vi.ts`

**Behavior**
- URL input uses a 56 px control height.
- Analyze is the primary action before readiness.
- Crawl becomes primary only after successful analysis.
- Enter submits analyze.
- Field validation stays below the field.
- Mutation loading state cannot cause duplicate submission.
- Existing result remains visible when a new request is refreshing only when semantically safe.
- Reset is explicit.

**Steps**
- [ ] Update E2E test to expect the new command card and verify it fails.
- [ ] Implement `CrawlCommandCard` using Phase 1 `Surface`, `Input`, `Button`, and `InlineNotice`.
- [ ] Move action layout out of `CrawlPage`.
- [ ] Add translated labels, hints, validation, and loading text.
- [ ] Verify 320 px layout and virtual keyboard interaction.
- [ ] Run focused E2E, regression, type-check, and build.
- [ ] Commit command surface.

**Acceptance**
A first-time user can identify where to paste a URL and which action to use without reading diagnostics.

---

## Task 2.4 — Build analyze result and source status panels

**Files**
- Create: `apps/web/src/widgets/crawl-result/ui/CrawlResultCard.tsx`
- Create: `apps/web/src/widgets/crawl-status/ui/CrawlStatusPanel.tsx`
- Modify: `apps/web/src/widgets/dashboard-stats/ui/DashboardStats.tsx`
- Modify: `apps/web/src/pages/crawl/ui/CrawlPage.tsx`

**Displayed data**
- title
- detected source name when available
- chapter count when available
- current operation state
- success or failure summary

**Rules**
- Unknown data is rendered as unavailable, never zero unless the API returned zero.
- The card does not imply crawl support when source detection failed.
- Status text accompanies every icon and color.
- Background refresh uses `RefreshIndicator`.

**Steps**
- [ ] Add failing tests for unknown versus zero values.
- [ ] Implement result mapping in the model.
- [ ] Implement status and result widgets.
- [ ] Replace old inline result markup.
- [ ] Verify screen-reader status announcement.
- [ ] Run all Phase 2 focused tests.
- [ ] Commit result panels.

**Acceptance**
Analyze output is understandable in success, partial, unsupported, and error states.

---

## Task 2.5 — Add crawl diagnostics sheet

**Files**
- Create: `apps/web/src/widgets/crawl-diagnostics/ui/CrawlDiagnosticsSheet.tsx`
- Create: `apps/web/src/features/copy-diagnostics/ui/CopyDiagnosticsButton.tsx`
- Modify: `apps/web/src/pages/crawl/ui/CrawlPage.tsx`
- Modify: `apps/web/src/shared/api/errors.ts` only to expose already-available normalized detail

**Behavior**
- Diagnostics are hidden behind a secondary action.
- Sheet contains source URL, normalized error category, request stage, and technical detail when available.
- Copy action uses plain text and shows toast confirmation.
- No secret, token, or full HTML document is exposed.
- Sheet remains usable at 320 × 640.

**Steps**
- [ ] Write a failing test for redaction and copy formatting helper.
- [ ] Implement a pure diagnostic formatter.
- [ ] Implement copy feature with clipboard capability fallback.
- [ ] Implement the bottom sheet.
- [ ] Add E2E for open, copy, close, and focus restoration.
- [ ] Run tests and build.
- [ ] Commit diagnostics.

**Acceptance**
Technical users can retrieve useful failure information without overwhelming the default view.

---

## Task 2.6 — Create task dashboard view model

**Files**
- Create: `apps/web/src/pages/tasks/model/taskDashboard.ts`
- Modify: `apps/web/src/pages/tasks/model/useTasksPage.ts`
- Modify: `apps/web/src/entities/task/model/types.ts` only for additive display types

**Interfaces**
```ts
export type TaskGroup = "active" | "queued" | "history";
export type TaskTone = "information" | "success" | "warning" | "danger" | "neutral";

export interface TaskDashboardItem {
  id: string;
  title: string;
  statusLabel: string;
  group: TaskGroup;
  tone: TaskTone;
  progress: number | null;
  canRetry: boolean;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}
```

**Steps**
- [ ] Write tests for each backend task status.
- [ ] Test progress clamping and absent progress.
- [ ] Test grouping order: active, queued, history.
- [ ] Implement pure mapping and sorting helpers.
- [ ] Update hook to expose summary counts, grouped items, refresh state, and filters.
- [ ] Run focused tests and type-check.
- [ ] Commit task model.

**Acceptance**
UI widgets do not inspect raw task status strings.

---

## Task 2.7 — Build task summary and task cards

**Files**
- Create: `apps/web/src/widgets/task-summary/ui/TaskSummary.tsx`
- Create: `apps/web/src/entities/task/ui/TaskCard.tsx`
- Modify: `apps/web/src/entities/task/ui/TaskProgress.tsx`
- Modify: `apps/web/src/widgets/task-list/ui/TaskList.tsx`
- Modify: `apps/web/src/pages/tasks/ui/TasksPage.tsx`

**Behavior**
- Summary shows active, queued, completed, and failed counts.
- Task cards use status label plus visual tone.
- Progress is determinate only when a real value exists.
- Timestamp display uses a shared formatter.
- Active items appear before historical items.
- Empty history and entirely empty task system use different copy.

**Steps**
- [ ] Add failing component structure tests.
- [ ] Implement task summary with responsive 2×2 mobile grid.
- [ ] Implement task card.
- [ ] Migrate task list and page.
- [ ] Verify large text does not clip status labels.
- [ ] Run regression, E2E, type-check, and build.
- [ ] Commit task dashboard.

**Acceptance**
The task screen communicates system state within one viewport without opening each task.

---

## Task 2.8 — Add filters and task details

**Files**
- Create: `apps/web/src/features/filter-tasks/model/useTaskFilters.ts`
- Create: `apps/web/src/features/filter-tasks/ui/TaskFilterBar.tsx`
- Create: `apps/web/src/features/view-task-details/ui/TaskDetailsSheet.tsx`
- Create: `apps/web/src/features/retry-task/ui/RetryTaskButton.tsx` only if an existing retry API exists
- Modify: `apps/web/src/pages/tasks/ui/TasksPage.tsx`

**Filters**
- all
- active
- queued
- completed
- failed

**Rules**
- Filtering is client-side over loaded tasks unless server pagination requires otherwise.
- Retry control exists only when both API and task state support it.
- Details show identifiers only as secondary technical information.
- Sheet actions are explicit and accessible.

**Steps**
- [ ] Add failing filter behavior tests.
- [ ] Implement filter hook as pure derived state.
- [ ] Implement filter chips.
- [ ] Implement details sheet.
- [ ] Add retry only after proving the current API endpoint exists.
- [ ] Add E2E for failed filter and details.
- [ ] Run the complete Phase 2 suite.
- [ ] Commit filter/details.

**Acceptance**
Users can isolate failures quickly, and the UI never promises unsupported control.

---

## Task 2.9 — Phase 2 release verification

**Manual matrix**
- 320, 360, 390 px
- light/dark
- English/Vietnamese
- API online/offline
- empty, active, success, and failed tasks
- analyze success/error/unsupported source

**Commands**
```bash
npm run check:lockfile
npm run check
npm run test:regression
npm run test:integration
npm run build
npm run test:e2e
npm audit
```

**Completion**
- [ ] Update `CHANGELOG.md`.
- [ ] Update version to `2.1.0-beta.1`.
- [ ] Confirm no API contract changed.
- [ ] Confirm no fake operational metric exists.
- [ ] Confirm CI passes before tag.

## Phase 2 exit criteria

All Crawl and Tasks flows use the Phase 1 design system, mobile E2E passes, and operational information is accurate rather than decorative.
