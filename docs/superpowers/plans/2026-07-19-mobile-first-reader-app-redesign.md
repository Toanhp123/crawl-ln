# Mobile-First Reader App Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the existing frontend into a mobile-first reader application with Library, Activity, Sources, Settings, a global add-novel action, desktop sidebar navigation, and a full-screen reader while preserving existing application logic and components.

**Architecture:** Perform a soft frontend refactor. Keep all backend contracts, TanStack Query hooks, crawler/task state, realtime invalidation, reader cache, reading-progress persistence, and design primitives; add thin page models and presentation components that recompose those capabilities under the new information architecture. Compatibility routes redirect to the new route model so the migration remains safe and reversible.

**Tech Stack:** React 18, React Router 7, TypeScript 5.5, TanStack Query 5, Tailwind CSS 3, Radix UI overlays, Lucide icons, Node test runner regression tests, Playwright E2E.

## Global Constraints

- Frontend only; do not change backend API or crawler semantics.
- Reuse the existing design system and current components; do not add another component library.
- Mobile-first layout with bottom navigation; desktop and wide tablet use a left sidebar.
- Library is the default route.
- Crawl and Tasks become one Activity experience.
- Source-profile management moves out of Settings into a dedicated Sources area.
- The global add-novel flow must not navigate away from the current page.
- Reader must render through `ReaderShell` with application navigation hidden.
- Preserve realtime, task lifecycle, cache, reading progress, backup, restore, and export behavior.
- Node.js remains `>=22.12.0`; npm remains `>=10.0.0`.
- No raw JSON as the default source-profile editing UI.

---

## File Structure Map

### New files

- `apps/web/src/app/layouts/AppSidebar.tsx` — desktop navigation and global add action trigger.
- `apps/web/src/app/model/GlobalAddNovelContext.tsx` — shell-owned open/close state for the add-novel overlay.
- `apps/web/src/features/add-novel/ui/GlobalAddNovelOverlay.tsx` — responsive sheet/modal wrapper.
- `apps/web/src/features/add-novel/ui/QuickAddNovelForm.tsx` — minimal URL-first add flow using existing analyze/crawl hooks.
- `apps/web/src/pages/activity/model/useActivityPage.ts` — derives running, queued, and recent task groups.
- `apps/web/src/pages/activity/ui/ActivityPage.tsx` — unified task timeline.
- `apps/web/src/pages/sources/model/useSourcesPage.ts` — source-plugin query/mutations and derived status.
- `apps/web/src/pages/sources/ui/SourcesPage.tsx` — source profile list.
- `apps/web/src/pages/sources/ui/SourceProfileCard.tsx` — reusable source summary card.
- `apps/web/src/pages/sources/ui/SourceProfilePage.tsx` — two-tier source detail/editor shell.
- `tests/regression/mobile-first-reader-navigation.test.ts` — route, nav, shell, and compatibility contract.
- `tests/regression/activity-page-contract.test.ts` — Activity grouping and UI contract.
- `tests/regression/sources-page-contract.test.ts` — Sources extraction and Settings boundary.
- `tests/e2e/mobile-reader-app-flow.spec.ts` — primary mobile navigation/add/activity smoke flow.

### Modified files

- `apps/web/src/app/router/AppRouter.tsx` — target routes and redirects.
- `apps/web/src/app/router/routePreload.ts` — new route loaders and preloading map.
- `apps/web/src/app/layouts/AppShell.tsx` — responsive shell, provider, sidebar, add overlay.
- `apps/web/src/app/layouts/AppScrollViewport.tsx` — desktop sidebar/content sizing if required.
- `apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx` — Library, Activity, center action, Sources, Settings.
- `apps/web/src/shared/ui/navigation/BottomNav.tsx` — support non-route center action.
- `apps/web/src/shared/ui/index.ts` — export any new shared navigation type if needed.
- `apps/web/src/pages/library/ui/LibraryPage.tsx` — reader-first header, compact controls, empty copy.
- `apps/web/src/widgets/library-grid/ui/LibraryGrid.tsx` — 2/3–4/4–6 responsive density.
- `apps/web/src/entities/novel/ui/NovelLibraryCard.tsx` — one priority badge and reader-first density.
- `apps/web/src/pages/settings/ui/SettingsPage.tsx` — remove source management and reorganize sections.
- `apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx` — presentation-only reader chrome refinements.
- `apps/web/src/widgets/reader-toolbar/ui/ReaderToolbar.tsx` — minimal top controls.
- `apps/web/src/widgets/reader-bottom-bar/ui/ReaderBottomBar.tsx` — previous/list/next controls.
- `apps/web/src/shared/i18n/locales/en.ts` — new navigation, Activity, Sources, add-flow copy.
- `apps/web/src/shared/i18n/locales/vi.ts` — matching Vietnamese copy.
- `apps/web/src/app/styles/index.css` and theme token files only as needed — bounded desktop width and warm reader-first surfaces.

---

### Task 1: Lock the new route and navigation contract

**Files:**
- Create: `tests/regression/mobile-first-reader-navigation.test.ts`
- Modify: `apps/web/src/app/router/AppRouter.tsx`
- Modify: `apps/web/src/app/router/routePreload.ts`
- Modify: `apps/web/src/app/router/HomeRedirect.tsx`

**Interfaces:**
- Consumes: current lazy route-loader pattern and `AppShell`/`ReaderShell` nesting.
- Produces: loaders named `activity`, `sources`, `sourceProfile`; public routes `/activity`, `/sources`, `/sources/new`, `/sources/:profileId`; compatibility redirects from `/crawl` and `/tasks`.

- [ ] **Step 1: Write the failing route contract test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) =>
  readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('reader-first routes replace crawl and tasks destinations', () => {
  const router = read('apps/web/src/app/router/AppRouter.tsx');
  assert.match(router, /path="\/activity"/);
  assert.match(router, /path="\/activity\/:taskId"/);
  assert.match(router, /path="\/sources"/);
  assert.match(router, /path="\/sources\/new"/);
  assert.match(router, /path="\/sources\/:profileId"/);
  assert.match(router, /path="\/crawl" element={<Navigate to="\/activity" replace \/>}/);
  assert.match(router, /path="\/tasks" element={<Navigate to="\/activity" replace \/>}/);
});

test('reader remains under ReaderShell and root resolves to library', () => {
  const router = read('apps/web/src/app/router/AppRouter.tsx');
  const home = read('apps/web/src/app/router/HomeRedirect.tsx');
  assert.match(router, /<ReaderShell \/>/);
  assert.match(router, /read\/:chapterIndex/);
  assert.match(home, /\/library/);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --import tsx --test tests/regression/mobile-first-reader-navigation.test.ts`

Expected: FAIL because `/activity` and `/sources` routes/loaders do not exist.

- [ ] **Step 3: Add lazy route loaders and compatibility redirects**

Use this target shape in `AppRouter.tsx`:

```tsx
const ActivityPage = lazy(() =>
  routeLoaders.activity().then((module) => ({ default: module.ActivityPage }))
);
const SourcesPage = lazy(() =>
  routeLoaders.sources().then((module) => ({ default: module.SourcesPage }))
);
const SourceProfilePage = lazy(() =>
  routeLoaders.sourceProfile().then((module) => ({ default: module.SourceProfilePage }))
);

<Route element={<AppShell />}>
  <Route path="/library" element={<LibraryPage />} />
  <Route path="/library/:novelId" element={<NovelDetailRoute />}>
    <Route element={<ReaderShell />}>
      <Route path="read/:chapterIndex" element={<ChapterReaderPage />} />
    </Route>
  </Route>
  <Route path="/activity" element={<ActivityPage />} />
  <Route path="/activity/:taskId" element={<TaskDetailPage />} />
  <Route path="/sources" element={<SourcesPage />} />
  <Route path="/sources/new" element={<SourceProfilePage mode="create" />} />
  <Route path="/sources/:profileId" element={<SourceProfilePage mode="edit" />} />
  <Route path="/settings" element={<SettingsPage />} />
  <Route path="/crawl" element={<Navigate to="/activity" replace />} />
  <Route path="/tasks" element={<Navigate to="/activity" replace />} />
  <Route path="/tasks/:taskId" element={<Navigate to="/activity" replace />} />
</Route>
```

Update `routePreload.ts` with `TopLevelRoute = 'library' | 'activity' | 'sources' | 'settings'` and matching `routeName()` branches.

- [ ] **Step 4: Run route and architecture checks**

Run:

```bash
node --import tsx --test tests/regression/mobile-first-reader-navigation.test.ts
npm run check:web-arch
npm run check -w @novel-tool/web
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/regression/mobile-first-reader-navigation.test.ts apps/web/src/app/router/AppRouter.tsx apps/web/src/app/router/routePreload.ts apps/web/src/app/router/HomeRedirect.tsx
git commit -m "feat(web): establish reader-first route model"
```

---

### Task 2: Add shell-owned global add-novel state and responsive navigation

**Files:**
- Create: `apps/web/src/app/model/GlobalAddNovelContext.tsx`
- Create: `apps/web/src/app/layouts/AppSidebar.tsx`
- Modify: `apps/web/src/app/layouts/AppShell.tsx`
- Modify: `apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx`
- Modify: `apps/web/src/shared/ui/navigation/BottomNav.tsx`
- Modify: `tests/regression/mobile-first-reader-navigation.test.ts`

**Interfaces:**
- Produces: `useGlobalAddNovel(): { open: () => void; close: () => void; isOpen: boolean }`.
- Produces: `BottomNavActionItem` with `kind: 'action'`, `onClick`, and no `href`.
- Consumes: `useTaskSummary()` for Activity badge.

- [ ] **Step 1: Extend the regression test for five-position navigation and sidebar**

```ts
test('mobile navigation exposes four routes and one global add action', () => {
  const tabs = read('apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx');
  for (const route of ['/library', '/activity', '/sources', '/settings']) {
    assert.match(tabs, new RegExp(route.replace('/', '\\/')));
  }
  assert.match(tabs, /kind:\s*'action'/);
  assert.match(tabs, /open\(\)/);
  assert.doesNotMatch(tabs, /href:\s*'\/crawl'/);
  assert.doesNotMatch(tabs, /href:\s*'\/tasks'/);
});

test('desktop shell renders a sidebar and global add overlay host', () => {
  const shell = read('apps/web/src/app/layouts/AppShell.tsx');
  assert.match(shell, /GlobalAddNovelProvider/);
  assert.match(shell, /AppSidebar/);
  assert.match(shell, /GlobalAddNovelOverlay/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --import tsx --test tests/regression/mobile-first-reader-navigation.test.ts`

Expected: FAIL because action items/context/sidebar are absent.

- [ ] **Step 3: Implement the global action context**

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface GlobalAddNovelValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const GlobalAddNovelContext = createContext<GlobalAddNovelValue | null>(null);

export function GlobalAddNovelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(
    () => ({ isOpen, open: () => setOpen(true), close: () => setOpen(false) }),
    [isOpen]
  );
  return <GlobalAddNovelContext.Provider value={value}>{children}</GlobalAddNovelContext.Provider>;
}

export function useGlobalAddNovel() {
  const value = useContext(GlobalAddNovelContext);
  if (!value) throw new Error('useGlobalAddNovel must be used inside GlobalAddNovelProvider');
  return value;
}
```

- [ ] **Step 4: Extend `BottomNav` with a discriminated union**

```tsx
export type BottomNavItem =
  | {
      kind?: 'route';
      id: string;
      label: string;
      icon: ReactNode;
      href: string;
      badge?: number;
      onIntent?: () => void;
    }
  | {
      kind: 'action';
      id: string;
      label: string;
      icon: ReactNode;
      onClick: () => void;
      prominent?: boolean;
      badge?: number;
    };
```

Render `kind === 'action'` as a real `<button type="button">`, with the center action elevated using existing radius/elevation/focus tokens. Keep route items as `NavLink`.

- [ ] **Step 5: Recompose mobile tabs and desktop sidebar**

Use order `Library`, `Activity`, action, `Sources`, `Settings`. The Activity route receives `activeCount`; the action calls `useGlobalAddNovel().open()`.

`AppSidebar.tsx` must use the same destinations and expose a full-width `Add novel` button. Hide it below `md`; hide bottom tabs at `md` and above.

- [ ] **Step 6: Update `AppShell`**

Wrap shell content in `GlobalAddNovelProvider`, render sidebar beside the viewport, retain skip link and suspense, and mount `GlobalAddNovelOverlay` once at shell level.

- [ ] **Step 7: Verify**

Run:

```bash
node --import tsx --test tests/regression/mobile-first-reader-navigation.test.ts
npm run check -w @novel-tool/web
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/model/GlobalAddNovelContext.tsx apps/web/src/app/layouts/AppSidebar.tsx apps/web/src/app/layouts/AppShell.tsx apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx apps/web/src/shared/ui/navigation/BottomNav.tsx tests/regression/mobile-first-reader-navigation.test.ts
git commit -m "feat(web): add responsive navigation and global action"
```

---

### Task 3: Build the minimal global add-novel overlay

**Files:**
- Create: `apps/web/src/features/add-novel/ui/QuickAddNovelForm.tsx`
- Create: `apps/web/src/features/add-novel/ui/GlobalAddNovelOverlay.tsx`
- Modify: `apps/web/src/app/layouts/AppShell.tsx`
- Modify: `apps/web/src/shared/i18n/locales/en.ts`
- Modify: `apps/web/src/shared/i18n/locales/vi.ts`
- Create: `tests/regression/global-add-novel-flow.test.ts`

**Interfaces:**
- Consumes: `useAnalyzeNovel`, `useCrawlNovel`, `Field`, `Input`, `Button`, `InlineNotice`, `BottomSheet`, `Modal`, `toast`, and `useGlobalAddNovel`.
- Produces: `QuickAddNovelForm({ onComplete }: { onComplete: (taskId: string) => void })`.

- [ ] **Step 1: Write the failing add-flow contract test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('quick add keeps URL-first flow and hides advanced options by default', () => {
  const form = read('apps/web/src/features/add-novel/ui/QuickAddNovelForm.tsx');
  assert.match(form, /useAnalyzeNovel/);
  assert.match(form, /useCrawlNovel/);
  assert.match(form, /autoFocus/);
  assert.match(form, /navigator\.clipboard\.readText/);
  assert.match(form, /advancedOpen/);
  assert.match(form, /Add to library|addNovel\.submit/);
});

test('overlay uses sheet on mobile and modal on desktop', () => {
  const overlay = read('apps/web/src/features/add-novel/ui/GlobalAddNovelOverlay.tsx');
  assert.match(overlay, /BottomSheet/);
  assert.match(overlay, /Modal/);
  assert.match(overlay, /useGlobalAddNovel/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --import tsx --test tests/regression/global-add-novel-flow.test.ts`

Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement the URL-first form**

Required state and submit sequence:

```tsx
const [url, setUrl] = useState('');
const [advancedOpen, setAdvancedOpen] = useState(false);
const [detail, setDetail] = useState<NovelDetail>();

const analyze = useAnalyzeNovel({ onAnalyzed: setDetail });
const crawl = useCrawlNovel();

const submit = (event: FormEvent) => {
  event.preventDefault();
  const normalized = url.trim();
  if (!normalized) return;
  if (!detail) {
    analyze.mutate(normalized);
    return;
  }
  crawl.mutate(detail.novel.id, {
    onSuccess: (task) => onComplete(task.id)
  });
};
```

After analyze succeeds, automatically start crawl in a guarded effect so the common path remains one submit. Preserve `url` on error. The advanced disclosure initially contains only existing supported controls; do not invent backend fields.

Clipboard action:

```tsx
const paste = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) setUrl(text.trim());
  } catch {
    toast.error(t('addNovel.clipboardError'));
  }
};
```

- [ ] **Step 4: Implement responsive overlay behavior**

Mount both primitives with CSS breakpoint visibility, or use a stable `matchMedia` hook already present in the codebase. Both presentations must host the same `QuickAddNovelForm` and preserve entered state during validation errors.

On completion:

```tsx
const handleComplete = () => {
  close();
  toast.success(t('addNovel.success'), {
    action: { label: t('activity.open'), onClick: () => navigate('/activity') }
  });
};
```

Use the actual toast API shape from `apps/web/src/shared/ui/feedback/Toast.tsx`; adapt the snippet to that API without changing behavior.

- [ ] **Step 5: Add translations**

Add exact matching keys in both locale files for: title, URL label, paste, submit, advanced options, success, invalid URL, clipboard error, retry, and open Activity.

- [ ] **Step 6: Verify**

Run:

```bash
node --import tsx --test tests/regression/global-add-novel-flow.test.ts
npm run check -w @novel-tool/web
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/add-novel apps/web/src/app/layouts/AppShell.tsx apps/web/src/shared/i18n/locales/en.ts apps/web/src/shared/i18n/locales/vi.ts tests/regression/global-add-novel-flow.test.ts
git commit -m "feat(web): add global URL-first novel import"
```

---

### Task 4: Replace Tasks/Crawl pages with a unified Activity timeline

**Files:**
- Create: `apps/web/src/pages/activity/model/useActivityPage.ts`
- Create: `apps/web/src/pages/activity/ui/ActivityPage.tsx`
- Create: `tests/regression/activity-page-contract.test.ts`
- Modify: `apps/web/src/widgets/crawl-task-card/ui/CrawlTaskCard.tsx`
- Modify: `apps/web/src/widgets/task-list/ui/TaskList.tsx`
- Modify: `apps/web/src/features/filter-tasks/ui/TaskFilterBar.tsx`
- Modify: `apps/web/src/shared/i18n/locales/en.ts`
- Modify: `apps/web/src/shared/i18n/locales/vi.ts`

**Interfaces:**
- Consumes: `useTasks()`, task status helpers, `CrawlTaskCard`, `TaskProgress`, `TaskFilterBar`.
- Produces: `{ running, queued, recent, filter, setFilter, counts, retryTask }` from `useActivityPage()`.

- [ ] **Step 1: Write model behavior and page contract tests**

```ts
test('activity model exposes running queued and recent groups', () => {
  const model = read('apps/web/src/pages/activity/model/useActivityPage.ts');
  assert.match(model, /running/);
  assert.match(model, /queued/);
  assert.match(model, /recent/);
  assert.match(model, /useTasks/);
});

test('activity page renders timeline section order', () => {
  const page = read('apps/web/src/pages/activity/ui/ActivityPage.tsx');
  const running = page.indexOf("activity.running");
  const queued = page.indexOf("activity.queued");
  const recent = page.indexOf("activity.recent");
  assert.ok(running >= 0 && queued > running && recent > queued);
  assert.doesNotMatch(page, /AnalyzeNovelForm|ImportNovelWizard|CrawlCommandCard/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --import tsx --test tests/regression/activity-page-contract.test.ts`

Expected: FAIL because Activity files do not exist.

- [ ] **Step 3: Implement deterministic grouping**

Use existing task status helpers rather than string duplication. Sort running and queued oldest-first by queue relevance; sort recent newest-first by `updatedAt`. Limit recent rendering to an initial page size and expose `showMore` state rather than rendering unbounded history.

Target derivation:

```ts
const running = filtered.filter((task) => isTaskPolling(task.status));
const queued = filtered.filter((task) => task.status === 'queued');
const recent = filtered
  .filter((task) => !isTaskPolling(task.status) && task.status !== 'queued')
  .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
```

Adjust to the actual status vocabulary exported by `entities/task/model/status.ts`.

- [ ] **Step 4: Build Activity UI**

Use `Page`, compact `PageHeader`, `Section`, `BottomSheet` for mobile filters, and direct filter chips on desktop. Running cards display progress and primary controls; queued rows show queue order; recent rows show outcome, chapter delta if available, timestamp, and retry for failed/cancelled tasks.

Task card navigation must point to `/activity/${task.id}`.

- [ ] **Step 5: Preserve existing task capabilities**

Do not duplicate cancel/pause/resume API calls. Extend `CrawlTaskCard` props only when needed, keeping current callbacks and query invalidation.

- [ ] **Step 6: Verify**

Run:

```bash
node --import tsx --test tests/regression/activity-page-contract.test.ts tests/regression/task-status-ui-behavior.test.ts tests/regression/crawl-task-telemetry.test.ts
npm run check -w @novel-tool/web
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/activity apps/web/src/widgets/crawl-task-card apps/web/src/widgets/task-list apps/web/src/features/filter-tasks apps/web/src/shared/i18n/locales/en.ts apps/web/src/shared/i18n/locales/vi.ts tests/regression/activity-page-contract.test.ts
git commit -m "feat(web): unify crawl and tasks in Activity"
```

---

### Task 5: Refine Library into the reader-first home

**Files:**
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`
- Modify: `apps/web/src/widgets/continue-reading/ui/ContinueReadingHero.tsx`
- Modify: `apps/web/src/widgets/library-grid/ui/LibraryGrid.tsx`
- Modify: `apps/web/src/entities/novel/ui/NovelLibraryCard.tsx`
- Modify: `apps/web/src/features/filter-library/ui/LibraryControlsSheet.tsx`
- Create: `tests/regression/reader-first-library.test.ts`

**Interfaces:**
- Consumes: existing `useLibraryPage()` model unchanged unless a missing derived field is required.
- Produces: a 2-column mobile grid, optional single continue-reading hero, one priority badge per cover, compact search/filter header.

- [ ] **Step 1: Write failing structural tests**

```ts
test('library keeps continue reading optional and uses mobile two-column density', () => {
  const page = read('apps/web/src/pages/library/ui/LibraryPage.tsx');
  const grid = read('apps/web/src/widgets/library-grid/ui/LibraryGrid.tsx');
  assert.match(page, /ContinueReadingHero/);
  assert.match(page, /showContinueRegion/);
  assert.match(grid, /grid-cols-2/);
  assert.match(grid, /md:grid-cols-[34]/);
});

test('library empty state directs users to global add action without crawler language', () => {
  const page = read('apps/web/src/pages/library/ui/LibraryPage.tsx');
  assert.match(page, /useGlobalAddNovel/);
  assert.doesNotMatch(page, /crawl URL|crawler/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --import tsx --test tests/regression/reader-first-library.test.ts`

Expected: FAIL on global action and responsive grid contract.

- [ ] **Step 3: Recompose the header and empty state**

Keep search and `LibraryControlsSheet`; remove duplicate add actions from page header. Empty-state primary action calls `useGlobalAddNovel().open()`.

- [ ] **Step 4: Apply density and priority badge rules**

`LibraryGrid` target classes:

```tsx
<div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
```

Within the bounded desktop shell, allow a sixth column only if card minimum width remains readable. `NovelLibraryCard` computes one badge using priority: error > updating > new chapters > completed.

- [ ] **Step 5: Keep management actions and progress logic intact**

Do not remove update, detail, export, manage, or delete actions; move them into the existing overflow/menu presentation if necessary. Preserve reading progress and return-state behavior.

- [ ] **Step 6: Verify Library regression suite**

Run:

```bash
node --import tsx --test tests/regression/reader-first-library.test.ts tests/regression/library-ux-phase-3.test.ts tests/regression/library-loading-stability.test.ts tests/regression/continue-reading-position-restore.test.ts
npm run check -w @novel-tool/web
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/library/ui/LibraryPage.tsx apps/web/src/widgets/continue-reading/ui/ContinueReadingHero.tsx apps/web/src/widgets/library-grid/ui/LibraryGrid.tsx apps/web/src/entities/novel/ui/NovelLibraryCard.tsx apps/web/src/features/filter-library/ui/LibraryControlsSheet.tsx tests/regression/reader-first-library.test.ts
git commit -m "feat(web): make Library the reader-first home"
```

---

### Task 6: Extract source management into Sources pages

**Files:**
- Create: `apps/web/src/pages/sources/model/useSourcesPage.ts`
- Create: `apps/web/src/pages/sources/ui/SourceProfileCard.tsx`
- Create: `apps/web/src/pages/sources/ui/SourcesPage.tsx`
- Create: `apps/web/src/pages/sources/ui/SourceProfilePage.tsx`
- Modify: `apps/web/src/features/manage-source-plugins/api/sourcePlugins.ts`
- Modify: `apps/web/src/features/manage-source-plugins/ui/SourcePluginsPanel.tsx`
- Create: `tests/regression/sources-page-contract.test.ts`
- Modify: `apps/web/src/shared/i18n/locales/en.ts`
- Modify: `apps/web/src/shared/i18n/locales/vi.ts`

**Interfaces:**
- Consumes: `listSourcePlugins`, `reloadSourcePlugins`, `setSourcePluginEnabled`, `SourcePluginDescriptor`.
- Produces: source list cards and a two-tier detail page. Any unsupported edit capability must be displayed read-only rather than simulated.

- [ ] **Step 1: Write the boundary test**

```ts
test('Sources owns source profile presentation', () => {
  const page = read('apps/web/src/pages/sources/ui/SourcesPage.tsx');
  const detail = read('apps/web/src/pages/sources/ui/SourceProfilePage.tsx');
  assert.match(page, /SourceProfileCard/);
  assert.match(page, /useSourcesPage/);
  assert.match(detail, /advancedOpen/);
  assert.match(detail, /settings|selector|headers/i);
});

test('Settings no longer renders SourcePluginsPanel', () => {
  const settings = read('apps/web/src/pages/settings/ui/SettingsPage.tsx');
  assert.doesNotMatch(settings, /SourcePluginsPanel/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --import tsx --test tests/regression/sources-page-contract.test.ts`

Expected: FAIL because Sources pages do not exist and Settings still owns source UI.

- [ ] **Step 3: Build the list model from current API capabilities**

Use TanStack Query with the existing plugin query key or add a dedicated key in `queryKeys.ts`. Expose reload and enable/disable mutations with invalidation. Derive status as:

- disabled → `disabled`
- descriptor reports load error → `error`
- loaded and enabled → `active`
- otherwise → `needs-check`

Only use fields actually present in `SourcePluginDescriptor`.

- [ ] **Step 4: Build `SourceProfileCard` and Sources list**

Card displays name, domain/id, enabled state, load status, and available metadata. Menu actions must only expose supported operations. Add/edit/delete/default actions that lack backend endpoints must be visibly disabled or omitted, with no fake persistence.

- [ ] **Step 5: Build two-tier detail page**

Basic section shows supported descriptor fields and enable toggle. Advanced disclosure presents selector/config metadata read-only when the API does not support writes. For create mode, show an explicit informative notice that new profile creation remains file/plugin based unless backend support exists; do not silently pretend to save.

This is the required safety adaptation because the approved UI direction exceeds the currently observed API (`list`, `reload`, `enable/disable`).

- [ ] **Step 6: Verify source platform contracts**

Run:

```bash
node --import tsx --test tests/regression/sources-page-contract.test.ts tests/regression/source-plugin-platform.test.ts tests/regression/novelcool-source-profile.test.ts
npm run check -w @novel-tool/web
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/sources apps/web/src/features/manage-source-plugins apps/web/src/shared/i18n/locales/en.ts apps/web/src/shared/i18n/locales/vi.ts tests/regression/sources-page-contract.test.ts
git commit -m "feat(web): move source management into Sources"
```

---

### Task 7: Simplify Settings around reader, appearance, storage, and system

**Files:**
- Modify: `apps/web/src/pages/settings/ui/SettingsPage.tsx`
- Modify: `apps/web/src/pages/settings/model/useSettingsPage.tsx`
- Modify: `apps/web/src/pages/settings/ui/SettingsHubCard.tsx`
- Modify: `tests/regression/settings-ux-phase-4.test.ts`
- Create: `tests/regression/settings-reader-first-boundary.test.ts`

**Interfaces:**
- Consumes: `ReaderSettingsControls`, `AutoUpdatePanel`, `BackupRestorePanel`, `SystemHealthCard`, current theme settings.
- Produces: four groups: Reading, Appearance, Sync & Storage, System; no source plugin panel and no crawl command UI.

- [ ] **Step 1: Write failing boundary test**

```ts
test('Settings contains reader-first groups and excludes source management', () => {
  const page = read('apps/web/src/pages/settings/ui/SettingsPage.tsx');
  for (const component of [
    'ReaderSettingsControls',
    'AutoUpdatePanel',
    'BackupRestorePanel',
    'SystemHealthCard'
  ]) assert.match(page, new RegExp(component));
  assert.doesNotMatch(page, /SourcePluginsPanel/);
  assert.doesNotMatch(page, /AnalyzeNovelForm|CrawlCommandCard/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --import tsx --test tests/regression/settings-reader-first-boundary.test.ts`

Expected: FAIL until source panel and crawler-oriented content are removed.

- [ ] **Step 3: Recompose Settings without changing underlying settings state**

Use existing `SettingsHubCard`, `SettingRow`, `ChoiceGroup`, and panels. Do not rename persisted keys. Add a row linking to `/sources` only if discoverability is needed; the actual management UI must not render inside Settings.

- [ ] **Step 4: Verify**

Run:

```bash
node --import tsx --test tests/regression/settings-reader-first-boundary.test.ts tests/regression/settings-ux-phase-4.test.ts tests/regression/app-font-setting.test.ts tests/regression/web-auto-sync-controls.test.ts
npm run check -w @novel-tool/web
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/settings tests/regression/settings-reader-first-boundary.test.ts tests/regression/settings-ux-phase-4.test.ts
git commit -m "refactor(web): focus Settings on reading and system preferences"
```

---

### Task 8: Refine Reader presentation without changing reader engine behavior

**Files:**
- Modify: `apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx`
- Modify: `apps/web/src/widgets/reader-toolbar/ui/ReaderToolbar.tsx`
- Modify: `apps/web/src/widgets/reader-bottom-bar/ui/ReaderBottomBar.tsx`
- Modify: `apps/web/src/features/reader-preferences/ui/ReaderPreferencesSheet.tsx`
- Modify: `apps/web/src/features/select-chapter/ui/ChapterListSheet.tsx`
- Create: `tests/regression/full-screen-reader-presentation.test.ts`

**Interfaces:**
- Consumes unchanged reader hooks: `useInfiniteReader`, `useReaderProgress`, `useSwipeChapterNavigation`, reading position/anchor storage, wake lock, IndexedDB cache.
- Produces presentation behavior: hidden app navigation, tap-to-toggle chrome, minimal top bar, previous/list/next bottom bar, full-screen sheets.

- [ ] **Step 1: Write presentation guard tests**

```ts
test('reader keeps existing engine hooks while using minimal chrome', () => {
  const page = read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  for (const token of [
    'useInfiniteReader',
    'useReaderProgress',
    'useSwipeChapterNavigation',
    'ReaderToolbar',
    'ReaderBottomBar',
    'ChapterListSheet',
    'ReaderPreferencesSheet'
  ]) assert.match(page, new RegExp(token));
  assert.match(page, /setChrome/);
});

test('reader bottom bar contains previous chapters next controls', () => {
  const bar = read('apps/web/src/widgets/reader-bottom-bar/ui/ReaderBottomBar.tsx');
  assert.match(bar, /previous/i);
  assert.match(bar, /chapters/i);
  assert.match(bar, /next/i);
});
```

- [ ] **Step 2: Run and verify baseline/failure**

Run: `node --import tsx --test tests/regression/full-screen-reader-presentation.test.ts`

Expected: Some assertions may already pass; any missing minimal-control contract must fail before changes.

- [ ] **Step 3: Make presentation-only changes**

Preserve all effects and persistence logic in `ChapterReaderPage`. Restrict edits to chrome structure, classes, labels, and sheet triggers. The reading content must not be wrapped in a visual card. Controls auto-hide using the existing timer and remain visible while sheets are open.

- [ ] **Step 4: Add desktop keyboard navigation if not already present**

Use a guarded effect:

```tsx
useEffect(() => {
  const onKeyDown = (event: KeyboardEvent) => {
    if (chaptersOpen || prefsOpen) return;
    if (event.key === 'ArrowLeft') openPrevious();
    if (event.key === 'ArrowRight') openNext();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, [chaptersOpen, prefsOpen, stream.previous?.index, stream.next?.index]);
```

Ignore keyboard events from inputs, textareas, selects, and contenteditable elements.

- [ ] **Step 5: Verify the complete reader regression set**

Run:

```bash
node --import tsx --test tests/regression/full-screen-reader-presentation.test.ts tests/regression/reader-controls.test.ts tests/regression/reader-engine.test.ts tests/regression/reader-lifecycle-stability.test.ts tests/regression/reader-progress-persistence.test.ts tests/regression/reading-continuity.test.ts
npm run check -w @novel-tool/web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx apps/web/src/widgets/reader-toolbar apps/web/src/widgets/reader-bottom-bar apps/web/src/features/reader-preferences apps/web/src/features/select-chapter tests/regression/full-screen-reader-presentation.test.ts
git commit -m "refactor(web): polish full-screen reader controls"
```

---

### Task 9: Apply bounded desktop layout and warm reader-first visual tokens

**Files:**
- Modify: `apps/web/src/app/styles/index.css`
- Modify: `apps/web/src/shared/theme/colors.css`
- Modify: `apps/web/src/shared/theme/component-tokens.css`
- Modify: `apps/web/src/shared/theme/elevation.css`
- Modify: `apps/web/src/shared/theme/radius.css`
- Modify: `apps/web/src/app/layouts/AppShell.tsx`
- Create: `tests/regression/reader-first-visual-contract.test.ts`

**Interfaces:**
- Produces: bounded desktop content width, warm neutral surfaces, restrained elevation, safe-area spacing, and no per-page ad hoc design system.

- [ ] **Step 1: Write token contract tests**

```ts
test('shell uses bounded desktop content and existing design tokens', () => {
  const shell = read('apps/web/src/app/layouts/AppShell.tsx');
  const css = read('apps/web/src/app/styles/index.css');
  assert.match(shell, /max-w-|app-content-max/);
  assert.match(css, /--app-content-max/);
  assert.doesNotMatch(shell, /#[0-9a-fA-F]{3,8}/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --import tsx --test tests/regression/reader-first-visual-contract.test.ts`

Expected: FAIL until bounded-width token is introduced.

- [ ] **Step 3: Add semantic layout tokens**

Add tokens such as:

```css
:root {
  --app-sidebar-width: 16rem;
  --app-content-max: 88rem;
  --app-reading-content-max: 46rem;
}
```

Use existing HSL semantic color variables; adjust values, not variable names. Avoid hard-coded colors in TSX.

- [ ] **Step 4: Verify design-system regressions**

Run:

```bash
node --import tsx --test tests/regression/reader-first-visual-contract.test.ts tests/regression/design-system-v2.test.ts tests/regression/ui-foundation-token-consolidation.test.ts tests/regression/ui-foundation-semantic-color.test.ts tests/regression/mobile-bottom-nav-polish.test.ts
npm run check -w @novel-tool/web
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/styles/index.css apps/web/src/shared/theme apps/web/src/app/layouts/AppShell.tsx tests/regression/reader-first-visual-contract.test.ts
git commit -m "style(web): apply warm reader-first responsive shell"
```

---

### Task 10: Add end-to-end mobile acceptance coverage and remove obsolete entry points

**Files:**
- Create: `tests/e2e/mobile-reader-app-flow.spec.ts`
- Modify: `tests/e2e/app-shell.spec.ts`
- Modify: obsolete regression tests that assert four-tab Crawl/Tasks navigation:
  - `tests/regression/mobile-navigation.test.ts`
  - `tests/regression/mobile-bottom-nav-polish.test.ts`
  - `tests/regression/mobile-header-sheet-task-detail.test.ts`
- Delete only if unreferenced after migration:
  - `apps/web/src/pages/crawl/ui/CrawlPage.tsx`
  - `apps/web/src/pages/crawl/model/useCrawlPage.ts`
  - `apps/web/src/pages/tasks/ui/TasksPage.tsx`
  - `apps/web/src/pages/tasks/model/useTasksPage.ts`

**Interfaces:**
- Produces: an executable acceptance flow for navigation and overlay behavior.
- Preserves: old URLs through redirects even when old page modules are removed.

- [ ] **Step 1: Write the E2E scenario**

```ts
import { test, expect } from '@playwright/test';

test('mobile shell exposes reader-first navigation and global add sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/library');

  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('link', { name: /library/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /activity/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /sources/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /settings/i })).toBeVisible();

  await page.getByRole('button', { name: /add novel/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel(/url/i)).toBeFocused();
});

test('legacy crawl and tasks routes redirect to Activity', async ({ page }) => {
  await page.goto('/crawl');
  await expect(page).toHaveURL(/\/activity$/);
  await page.goto('/tasks');
  await expect(page).toHaveURL(/\/activity$/);
});
```

Use locale-stable test IDs only when accessible labels cannot remain stable across English/Vietnamese.

- [ ] **Step 2: Run E2E and verify failures before final integration**

Run: `npm run test:e2e -- tests/e2e/mobile-reader-app-flow.spec.ts`

Expected: FAIL for any remaining missing integration.

- [ ] **Step 3: Update obsolete tests and remove dead page modules**

Search first:

```bash
rg "pages/(crawl|tasks)|routeLoaders\.(crawl|tasks)|/crawl|/tasks" apps/web/src tests/regression
```

Delete old page modules only after no production import remains. Keep redirects in `AppRouter.tsx`.

- [ ] **Step 4: Run full verification**

```bash
npm run check:lockfile
npm run check
npm run test:regression
npm run test:integration
npm run build
npm run test:e2e -- tests/e2e/app-shell.spec.ts tests/e2e/mobile-reader-app-flow.spec.ts
```

Expected: all commands PASS. If Playwright browsers are unavailable, run `npm run test:e2e:install` once and rerun; document the environment issue rather than claiming E2E passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src tests/regression tests/e2e
git commit -m "test(web): cover mobile-first reader app migration"
```

---

## Final Self-Review Checklist

- Every approved information-architecture requirement maps to Tasks 1–10.
- Backend APIs and crawler semantics remain unchanged.
- Sources editing is constrained to actual backend capabilities; unsupported create/delete/default persistence is not faked.
- Reader engine hooks and persistence logic are explicitly preserved.
- Compatibility redirects remain after obsolete page removal.
- No second component system or new frontend dependency is introduced.
- Every task has a failing-test step, implementation step, verification command, and commit boundary.
- Full verification includes architecture checks, regression, integration, build, and focused E2E.
