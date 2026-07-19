# Motion Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the complex JavaScript motion system while preserving route behavior, Reader persistence/navigation, Radix accessibility, and a small set of safe CSS-only transitions.

**Architecture:** React Router renders only the current route tree. Shared UI primitives may use short CSS transitions driven by Radix state selectors, while functional gestures use threshold-only Pointer/Touch detection without moving content. No JavaScript animation engine, retained page presence, shared layout identity, spring, velocity animation, or visual-only navigation snapshot remains.

**Tech Stack:** React 18.3.1, React Router 7, Radix UI, TypeScript 5.5, CSS/Tailwind, Node test runner, Playwright.

## Global Constraints

- Remove the `motion` package; do not add another animation dependency.
- Route and tab navigation render the destination immediately and retain no outgoing page tree.
- Radix owns portal, focus trap, Escape, and open/closed lifecycle.
- BottomSheet keeps close button, overlay click, Escape, and threshold-only downward dismiss from handle/header.
- Reader keeps reading-anchor persistence, chapter buttons, keyboard navigation, and simple swipe detection.
- No `motion/react`, `framer-motion`, `AnimatePresence`, `layoutId`, MotionValue, spring, velocity animation, Web Animations API, or JavaScript exit timer.
- Permitted visual motion is limited to safe CSS color/opacity/fixed-distance state transitions and loading keyframes.
- Reduced motion remains supported through `prefers-reduced-motion`.
- Preserve current FSD dependency direction and public component APIs where practical.

---

## File Structure After Rollback

### Delete

```text
apps/web/src/app/providers/AppMotionProvider.tsx
apps/web/src/app/providers/RouteMotionCoordinator.tsx
apps/web/src/shared/lib/motion/
apps/web/src/shared/ui/navigation/TabMotionIndicator.tsx
apps/web/src/widgets/bottom-tabs/ui/AnimatedTabIcon.tsx
apps/web/src/features/read-chapter/ui/ChapterSwipePreview.tsx
apps/web/src/features/open-novel/model/novelTransitionSnapshot.ts
apps/web/src/features/open-task/model/taskTransitionSnapshot.ts
```

Delete shared-element wrappers if they have no non-motion value:

```text
apps/web/src/entities/novel/ui/SharedNovelCover.tsx
apps/web/src/entities/novel/ui/SharedNovelTitle.tsx
apps/web/src/entities/task/ui/SharedTaskTitle.tsx
apps/web/src/entities/task/ui/SharedTaskStatus.tsx
```

### Create

```text
apps/web/src/features/read-chapter/model/useSwipeChapterNavigation.ts
tests/regression/motion-rollback-contract.test.ts
tests/e2e/motion-rollback.spec.ts
```

### Keep and simplify

```text
apps/web/src/shared/theme/motion.css
apps/web/src/shared/ui/overlay/BottomSheet.tsx
apps/web/src/shared/ui/feedback/ContentTransition.tsx
apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx
apps/web/src/app/layouts/ReaderShell.tsx
apps/web/src/pages/novel-detail/ui/NovelDetailRoute.tsx
apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx
```

---

### Task 1: Lock the Rollback Contract and Baseline

**Files:**
- Create: `tests/regression/motion-rollback-contract.test.ts`
- Modify: `tests/regression/ui-motion-foundation.test.ts`
- Modify: `tests/regression/ui-motion-theme-consolidation.test.ts`
- Modify: `tests/regression/app-motion-route-core.test.ts`
- Modify: `tests/regression/app-motion-shared-elements.test.ts`

**Interfaces:**
- Consumes: current source tree and `apps/web/package.json`.
- Produces: repository guards that define the final no-JS-motion architecture.

- [ ] **Step 1: Write a failing repository guard**

Create `tests/regression/motion-rollback-contract.test.ts` with assertions equivalent to:

```ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function sourceFiles(root: string): string[] {
  return readdirSync(join(ROOT, root)).flatMap((name) => {
    const relative = join(root, name);
    const absolute = join(ROOT, relative);
    return statSync(absolute).isDirectory()
      ? sourceFiles(relative)
      : /\.(ts|tsx|css)$/.test(name)
        ? [relative]
        : [];
  });
}

test('web source has no JavaScript animation engine or retained route presence', () => {
  const packageJson = JSON.parse(read('apps/web/package.json')) as {
    dependencies?: Record<string, string>;
  };
  assert.equal(packageJson.dependencies?.motion, undefined);
  assert.equal(packageJson.dependencies?.['framer-motion'], undefined);

  for (const file of sourceFiles('apps/web/src')) {
    const source = read(file);
    assert.doesNotMatch(source, /motion\/react|framer-motion/);
    assert.doesNotMatch(source, /\bAnimatePresence\b|\blayoutId\s*=|\bMotionValue\b/);
    assert.doesNotMatch(source, /\buseMotionValue\b|\buseSpring\b|\buseAnimation\b/);
    assert.doesNotMatch(source, /\.animate\s*\(|Element\.prototype\.animate/);
  }
});

test('app renders the current outlet directly without a route motion coordinator', () => {
  const main = read('apps/web/src/main.tsx');
  const shell = read('apps/web/src/app/layouts/AppShell.tsx');
  assert.doesNotMatch(main, /AppMotionProvider/);
  assert.doesNotMatch(shell, /RouteMotionCoordinator/);
  assert.match(shell, /<Outlet\s*\/>/);
});

test('BottomSheet gesture is threshold-only and never moves the panel inline', () => {
  const source = read('apps/web/src/shared/ui/overlay/BottomSheet.tsx');
  assert.doesNotMatch(source, /style=\{\{\s*y|transform:/);
  assert.doesNotMatch(source, /velocity|spring|rubberBand|useMotionValue|animate\(/);
  assert.match(source, /DISMISS_DISTANCE_PX/);
  assert.match(source, /onOpenChange\(false\)/);
});
```

Replace old tests that require route motion/shared layout with rollback assertions rather than deleting all coverage.

- [ ] **Step 2: Run the new guard and verify RED**

Run:

```bash
npm run test:regression -- --test-name-pattern="rollback|JavaScript animation engine|current outlet"
```

Expected: FAIL because `motion` is still installed and Motion components still exist.

- [ ] **Step 3: Record the baseline**

Run and save output in the implementation notes:

```bash
npm run check -w @novel-tool/web
npm run test:regression
npm run build -w @novel-tool/web
```

Expected before edits: existing suite/build pass; the new rollback guard fails.

- [ ] **Step 4: Commit the failing contract**

```bash
git add tests/regression/motion-rollback-contract.test.ts \
  tests/regression/ui-motion-foundation.test.ts \
  tests/regression/ui-motion-theme-consolidation.test.ts \
  tests/regression/app-motion-route-core.test.ts \
  tests/regression/app-motion-shared-elements.test.ts
git commit -m "test: define motion rollback contract"
```

---

### Task 2: Remove App-Level Motion and Render One Current Route

**Files:**
- Delete: `apps/web/src/app/providers/AppMotionProvider.tsx`
- Delete: `apps/web/src/app/providers/RouteMotionCoordinator.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/app/layouts/AppShell.tsx`
- Modify: `apps/web/src/app/layouts/AppScrollViewport.tsx`
- Modify: `apps/web/src/pages/novel-detail/ui/NovelDetailRoute.tsx`
- Modify: `tests/regression/reader-overlay-route.test.ts`
- Modify: `tests/e2e/app-shell.spec.ts`

**Interfaces:**
- Consumes: React Router `Outlet` and existing nested Reader route topology.
- Produces: one current route tree with no route transition context or pointer lock.

- [ ] **Step 1: Add a failing route-tree test**

Update `tests/regression/reader-overlay-route.test.ts` to require:

```ts
assert.match(appShell, /import \{ Outlet \} from 'react-router-dom'/);
assert.match(appShell, /<Outlet\s*\/>/);
assert.doesNotMatch(appShell, /RouteMotionCoordinator|data-route-surface|data-route-visual-layer/);
assert.doesNotMatch(main, /AppMotionProvider/);
assert.doesNotMatch(detailRoute, /AnimatePresence|motion\./);
```

The Reader route may keep a portal, but it must render from the current nested outlet without animated presence.

- [ ] **Step 2: Run and verify RED**

```bash
node --import tsx --test tests/regression/reader-overlay-route.test.ts
```

Expected: FAIL on `RouteMotionCoordinator` and `AppMotionProvider`.

- [ ] **Step 3: Replace the app composition**

Change `main.tsx` to compose providers without `AppMotionProvider`:

```tsx
<React.StrictMode>
  <ThemeProvider>
    <I18nProvider>
      <QueryProvider>
        <ErrorBoundaryProvider>
          <MaintenanceProvider>
            <BrowserRouter>
              <AppRouter />
            </BrowserRouter>
          </MaintenanceProvider>
        </ErrorBoundaryProvider>
      </QueryProvider>
    </I18nProvider>
  </ThemeProvider>
</React.StrictMode>
```

Change `AppShell.tsx` to import `Outlet` and render it directly:

```tsx
<AppScrollViewport>
  <main id="main-content" className="relative min-h-full">
    <Outlet />
  </main>
</AppScrollViewport>
```

Remove `layoutScroll`/Motion-only props from `AppScrollViewport` while preserving scroll restoration and landmark attributes.

Simplify `NovelDetailRoute` so the parent page and current Reader outlet follow the existing router topology without `AnimatePresence`, transition keys, or route-motion context.

- [ ] **Step 4: Verify route behavior**

```bash
node --import tsx --test \
  tests/regression/reader-overlay-route.test.ts \
  tests/regression/reader-detail-navigation.test.ts \
  tests/regression/app-motion-route-core.test.ts
npm run check -w @novel-tool/web
```

Expected: PASS. No source contains route surface pointer locks or visual layers.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.tsx \
  apps/web/src/app/layouts/AppShell.tsx \
  apps/web/src/app/layouts/AppScrollViewport.tsx \
  apps/web/src/pages/novel-detail/ui/NovelDetailRoute.tsx \
  tests/regression/reader-overlay-route.test.ts \
  tests/e2e/app-shell.spec.ts
git rm apps/web/src/app/providers/AppMotionProvider.tsx \
  apps/web/src/app/providers/RouteMotionCoordinator.tsx
git commit -m "refactor: render routes without motion lifecycle"
```

---

### Task 3: Remove Shared-Element Snapshots and Motion Wrappers

**Files:**
- Delete: `apps/web/src/features/open-novel/model/novelTransitionSnapshot.ts`
- Delete: `apps/web/src/features/open-task/model/taskTransitionSnapshot.ts`
- Delete or simplify: `apps/web/src/entities/novel/ui/SharedNovelCover.tsx`
- Delete or simplify: `apps/web/src/entities/novel/ui/SharedNovelTitle.tsx`
- Delete or simplify: `apps/web/src/entities/task/ui/SharedTaskTitle.tsx`
- Delete or simplify: `apps/web/src/entities/task/ui/SharedTaskStatus.tsx`
- Modify: Library card/list navigation files found by `rg "beginShared|NovelSharedTransitionSnapshot|SharedNovel" apps/web/src`
- Modify: Tasks page/card navigation files found by `rg "TaskSharedTransitionSnapshot|SharedTask" apps/web/src`
- Modify: `apps/web/src/pages/tasks/model/useTasksPage.ts`
- Modify: `apps/web/src/widgets/crawl-task-card/ui/CrawlTaskCard.tsx`
- Modify: `tests/regression/app-motion-shared-elements.test.ts`

**Interfaces:**
- Consumes: ordinary entity props (`novel`, `task`, `status`) and React Router navigation.
- Produces: ordinary cover/title/status rendering with no visual navigation state.

- [ ] **Step 1: Write failing tests for snapshot removal**

Require:

```ts
for (const file of sourceFiles('apps/web/src')) {
  const source = read(file);
  assert.doesNotMatch(source, /SharedTransitionSnapshot|beginShared|lastSettledShared/);
  assert.doesNotMatch(source, /data-shared-layout-id|layoutId=/);
}
```

Require navigation state to contain only functional return/scroll information, not cover URLs, titles, source rectangles, or status snapshots.

- [ ] **Step 2: Run and verify RED**

```bash
node --import tsx --test tests/regression/app-motion-shared-elements.test.ts
```

Expected: FAIL on current shared wrappers and snapshots.

- [ ] **Step 3: Replace shared wrappers with ordinary markup**

Preferred result:

```tsx
<img src={coverUrl ?? fallbackCover} alt="" className="..." />
<h1 className="...">{title}</h1>
<StatusBadge status={status} />
```

If a wrapper still improves entity reuse, rename it to a non-motion name such as `NovelCover` or `TaskStatus` and implement it as plain DOM. Do not preserve `Shared*` names solely for historical compatibility.

Update navigation actions to call `navigate(destination, { state: functionalStateOnly })` without visual snapshots.

- [ ] **Step 4: Verify Library and Tasks contracts**

```bash
node --import tsx --test \
  tests/regression/app-motion-shared-elements.test.ts \
  tests/regression/reader-detail-navigation.test.ts \
  tests/regression/task-navigation-model.test.ts
npm run check -w @novel-tool/web
```

Use the actual existing task navigation regression filename if it differs; locate with:

```bash
rg -l "TaskDetail|openTask|tasks/:taskId" tests/regression
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src tests/regression/app-motion-shared-elements.test.ts
git rm apps/web/src/features/open-novel/model/novelTransitionSnapshot.ts \
  apps/web/src/features/open-task/model/taskTransitionSnapshot.ts
git commit -m "refactor: remove shared element choreography"
```

---

### Task 4: Simplify Tabs, Lists, and Data-State Rendering

**Files:**
- Delete: `apps/web/src/shared/ui/navigation/TabMotionIndicator.tsx`
- Delete: `apps/web/src/widgets/bottom-tabs/ui/AnimatedTabIcon.tsx`
- Modify: `apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx`
- Modify: `apps/web/src/widgets/app-header/ui/AppHeader.tsx`
- Modify: `apps/web/src/shared/ui/feedback/ContentTransition.tsx`
- Modify: `apps/web/src/widgets/library-grid/ui/LibraryGrid.tsx`
- Modify: task-list/recent-task components using `AnimatePresence` or `motion.div`
- Modify: `apps/web/src/shared/ui/feedback/Skeleton.tsx`
- Modify: `apps/web/src/shared/ui/feedback/Progress.tsx`
- Modify: `apps/web/src/shared/ui/feedback/ProgressRing.tsx`
- Modify: relevant regression tests.

**Interfaces:**
- Consumes: active tab boolean, query state, list data.
- Produces: immediate rendering with static active state and preserved layout where required.

- [ ] **Step 1: Add failing static-navigation/data tests**

Require bottom tabs to pass icons directly:

```tsx
icon: () => <Library size={20} strokeWidth={1.85} />
```

Require no `TabMotionIndicator`, `AnimatedTabIcon`, `AnimatePresence`, `motion.div`, or list layout animation in these UI areas.

Require `ContentTransition` to preserve background-refetch behavior without layering:

```tsx
<div aria-busy={state === 'loading' || isRefreshing || undefined}>
  {resolvedContent}
</div>
```

- [ ] **Step 2: Run and verify RED**

```bash
node --import tsx --test \
  tests/regression/ui-motion-foundation.test.ts \
  tests/regression/ui-motion-theme-consolidation.test.ts
```

- [ ] **Step 3: Implement immediate/static rendering**

`AppBottomTabs` uses plain Lucide icons and the existing active color/background from `BottomNav`.

`ContentTransition` keeps `lastReadyRef` for background refetch, `aria-busy`, `minHeight`, and error/empty selection, but renders exactly one layer:

```tsx
return (
  <div ref={hostRef} data-content-transition className={cn('relative', className)} ...>
    {content}
  </div>
);
```

Library/task lists use normal `.map()` output. Keep stable keys, focus behavior, and virtualization/pagination logic; remove entry/exit/reorder animation only.

Keep safe CSS spinner and skeleton classes, but remove JS timing imports.

- [ ] **Step 4: Verify UI-state behavior**

```bash
npm run check -w @novel-tool/web
node --import tsx --test \
  tests/regression/ui-motion-foundation.test.ts \
  tests/regression/ui-motion-theme-consolidation.test.ts \
  tests/regression/production-polish-phase4.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src tests/regression
git rm apps/web/src/shared/ui/navigation/TabMotionIndicator.tsx \
  apps/web/src/widgets/bottom-tabs/ui/AnimatedTabIcon.tsx
git commit -m "refactor: use static navigation and data states"
```

---

### Task 5: Replace BottomSheet Physics with Threshold-Only Dismiss

**Files:**
- Modify: `apps/web/src/shared/ui/overlay/BottomSheet.tsx`
- Modify: `apps/web/src/shared/theme/motion.css`
- Modify: `tests/regression/ui-motion-foundation.test.ts`
- Modify: `tests/e2e/reader-motion.spec.ts`
- Create or extend: `tests/e2e/motion-rollback.spec.ts`

**Interfaces:**
- Consumes: `open`, `onOpenChange`, Radix Dialog lifecycle.
- Produces: accessible BottomSheet with button/overlay/Escape close and optional fixed-threshold downward gesture.

- [ ] **Step 1: Write failing BottomSheet tests**

Regression requirements:

```ts
assert.doesNotMatch(source, /motion\.div|useMotionValue|animate\(|spring|velocity|rubberBand/);
assert.doesNotMatch(source, /style=\{\{[^}]*transform|style=\{\{[^}]*y/);
assert.match(source, /const DISMISS_DISTANCE_PX = 72/);
assert.match(source, /distance >= DISMISS_DISTANCE_PX/);
```

E2E requirements:

1. Open sheet.
2. Downward swipe from header by more than 72 px; release; sheet closes.
3. Reopen; downward swipe by less than 72 px; sheet remains visually stationary and open.
4. Button, overlay, and Escape still close.
5. Scrollable body remains scrollable and interactive controls do not start dismiss.

- [ ] **Step 2: Run and verify RED**

```bash
node --import tsx --test tests/regression/ui-motion-foundation.test.ts
npx playwright test tests/e2e/motion-rollback.spec.ts --project="Mobile Chrome"
```

Expected: regression fails on Motion physics; E2E is absent or fails.

- [ ] **Step 3: Implement threshold-only gesture**

Use refs only for detection:

```ts
const DISMISS_DISTANCE_PX = 72;
type Gesture = { id: number; startY: number };
const gestureRef = useRef<Gesture | null>(null);

function begin(id: number, clientY: number, target: EventTarget | null) {
  if (!canStartFromTarget(target)) return;
  gestureRef.current = { id, startY: clientY };
}

function finish(id: number, clientY: number) {
  const gesture = gestureRef.current;
  gestureRef.current = null;
  if (!gesture || gesture.id !== id) return;
  if (clientY - gesture.startY >= DISMISS_DISTANCE_PX) onOpenChange(false);
}
```

Do not call `preventDefault` during move and do not update panel styles. Prefer evaluating distance on release. Header/handle may use `touch-action: pan-y`; body starts only when scrollTop is zero and target is non-interactive.

Render a plain `div` inside `Dialog.Content asChild`.

Use CSS-only Radix state classes. Prefer opacity-only panel lifecycle if fixed translation causes any reversal issue.

- [ ] **Step 4: Verify all BottomSheet close paths**

```bash
npm run check -w @novel-tool/web
node --import tsx --test tests/regression/ui-motion-foundation.test.ts
npx playwright test tests/e2e/motion-rollback.spec.ts --project="Mobile Chrome"
npx playwright test tests/e2e/motion-rollback.spec.ts --project="Desktop Chrome"
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/ui/overlay/BottomSheet.tsx \
  apps/web/src/shared/theme/motion.css \
  tests/regression/ui-motion-foundation.test.ts \
  tests/e2e/motion-rollback.spec.ts \
  tests/e2e/reader-motion.spec.ts
git commit -m "refactor: simplify bottom sheet dismissal"
```

---

### Task 6: Remove Reader Direct Manipulation and Motion Presence

**Files:**
- Delete: `apps/web/src/features/read-chapter/model/useChapterSwipeGesture.ts`
- Delete: `apps/web/src/features/read-chapter/ui/ChapterSwipePreview.tsx`
- Create: `apps/web/src/features/read-chapter/model/useSwipeChapterNavigation.ts`
- Modify: `apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx`
- Modify: `apps/web/src/app/layouts/ReaderShell.tsx`
- Modify: `apps/web/src/widgets/reader-toolbar/ui/ReaderToolbar.tsx`
- Modify: `apps/web/src/widgets/reader-bottom-bar/ui/ReaderBottomBar.tsx`
- Modify: `tests/regression/reader-controls.test.ts`
- Modify: `tests/regression/reader-lifecycle-stability.test.ts`
- Modify: `tests/e2e/reader-motion.spec.ts`

**Interfaces:**
- Consumes: `enabled`, `hasPrevious`, `hasNext`, `onPrevious`, `onNext`.
- Produces: simple swipe detector returning pointer handlers only; no transform, progress, direction preview, or committing animation state.

- [ ] **Step 1: Write failing Reader rollback tests**

Require the replacement hook API:

```ts
type SwipeChapterNavigation = Pick<
  HTMLAttributes<HTMLElement>,
  'onPointerDown' | 'onPointerUp' | 'onPointerCancel'
>;

useSwipeChapterNavigation({ enabled, hasPrevious, hasNext, onPrevious, onNext });
```

Require:

```ts
assert.doesNotMatch(readerPage, /motion\.|ChapterSwipePreview|style=\{\{\s*x/);
assert.doesNotMatch(readerShell, /AnimatePresence|initial=|exit=/);
assert.doesNotMatch(toolbar + bottomBar, /motion\.|animate=/);
```

- [ ] **Step 2: Run and verify RED**

```bash
node --import tsx --test \
  tests/regression/reader-controls.test.ts \
  tests/regression/reader-lifecycle-stability.test.ts
```

- [ ] **Step 3: Implement a simple swipe detector**

`useSwipeChapterNavigation.ts` should:

```ts
const HORIZONTAL_DISTANCE_PX = 72;
const VERTICAL_TOLERANCE_PX = 48;
```

- Record pointer-down coordinates for non-interactive targets.
- On release, compute `dx` and `dy`.
- Ignore if `abs(dy) > VERTICAL_TOLERANCE_PX` or `abs(dx) < HORIZONTAL_DISTANCE_PX`.
- Call previous for positive `dx`, next for negative `dx`, respecting availability.
- Keep existing ArrowLeft/ArrowRight keyboard behavior.
- Never set pointer capture, prevent default scrolling, or mutate transforms.

Update `ChapterReaderPage` to render normal reader content and call the new hook. Remove edge preview and direct manipulation wrappers.

Reader chrome may retain CSS classes for opacity/visibility, but no Motion components or JS completion callback. Hidden controls must keep `pointer-events: none`.

`ReaderShell` renders current outlet/portal immediately and restores focus through existing non-animation logic.

- [ ] **Step 4: Verify Reader behavior**

```bash
npm run check -w @novel-tool/web
node --import tsx --test \
  tests/regression/reader-controls.test.ts \
  tests/regression/reader-lifecycle-stability.test.ts \
  tests/regression/reader-detail-navigation.test.ts \
  tests/regression/reader-progress-persistence.test.ts
npx playwright test tests/e2e/reader-motion.spec.ts --project="Mobile Chrome"
```

Update E2E descriptions away from “motion” terminology while retaining chapter swipe, chrome toggle, anchor restoration, sheet close, and Back tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src tests/regression tests/e2e/reader-motion.spec.ts
git rm apps/web/src/features/read-chapter/model/useChapterSwipeGesture.ts \
  apps/web/src/features/read-chapter/ui/ChapterSwipePreview.tsx
git commit -m "refactor: simplify reader interactions"
```

---

### Task 7: Remove the Motion Package and Reduce CSS to Safe Transitions

**Files:**
- Delete: `apps/web/src/shared/lib/motion/`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Modify: `apps/web/src/shared/theme/motion.css`
- Modify: `apps/web/src/shared/theme/README.md`
- Modify: `apps/web/src/shared/theme/VISUAL_STYLE_GUIDE.md`
- Modify: remaining files found by motion import scan.
- Modify: `scripts/check-web-architecture.mjs`
- Modify: `scripts/check-web-contracts.mjs`
- Modify: `tests/regression/design-system-v2.test.ts`
- Modify: `tests/regression/production-polish-phase4.test.ts`
- Delete or replace: `tests/e2e/motion-theme.spec.ts`

**Interfaces:**
- Consumes: CSS variables already owned by the visual theme where useful.
- Produces: CSS-only safe transition layer and a hard repository guard against JS animation engines.

- [ ] **Step 1: Run a complete source scan and make it fail**

```bash
rg -n "@/shared/lib/motion|motion/react|AnimatePresence|layoutId|useMotion|motion\." \
  apps/web/src tests scripts
```

Expected before implementation: many matches.

- [ ] **Step 2: Remove dependency and source module**

```bash
npm uninstall motion -w @novel-tool/web
```

Confirm `apps/web/package.json` and root `package-lock.json` no longer contain the package.

Delete `apps/web/src/shared/lib/motion/` only after all consumers have been migrated.

- [ ] **Step 3: Rewrite `motion.css` as CSS-only safe states**

The final file may define semantic durations locally as CSS custom properties:

```css
:root {
  --ui-transition-fast: 120ms;
  --ui-transition-normal: 160ms;
  --ui-ease-standard: cubic-bezier(0.22, 0.61, 0.36, 1);
}

.motion-overlay {
  transition: opacity var(--ui-transition-fast) var(--ui-ease-standard);
}

.motion-dialog,
.motion-drawer,
.motion-bottom-sheet,
.motion-toast {
  transition: opacity var(--ui-transition-normal) var(--ui-ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --ui-transition-fast: 1ms;
    --ui-transition-normal: 1ms;
  }
}
```

Do not keep names implying JS ownership if clearer names are practical; renaming can be deferred only when it would create unnecessary churn.

Keep spinner keyframes and subtle skeleton pulse. Remove route, shared-element, list-layout, Reader-surface, gesture, and spring-specific tokens/keyframes.

- [ ] **Step 4: Add architecture guards**

Extend `scripts/check-web-architecture.mjs` or the rollback regression test to fail on:

```text
motion/react
framer-motion
from 'motion'
AnimatePresence
layoutId=
useMotionValue
useSpring
Element.animate(
requestAnimationFrame-based tween loops
```

Do not ban `requestAnimationFrame` globally because non-animation scheduling may be valid; match known tween/loop patterns or require review via targeted source paths.

- [ ] **Step 5: Verify zero engine references**

```bash
! rg -n "@/shared/lib/motion|motion/react|framer-motion|AnimatePresence|layoutId|useMotionValue" \
  apps/web/src
npm run check:lockfile
npm run check:web-arch
npm run check:web-contracts
npm run check -w @novel-tool/web
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src/shared/theme \
  scripts/check-web-architecture.mjs scripts/check-web-contracts.mjs \
  tests/regression tests/e2e
git rm -r apps/web/src/shared/lib/motion
git commit -m "refactor: remove JavaScript motion engine"
```

---

### Task 8: Replace Motion E2E Coverage and Run Full Verification

**Files:**
- Create/complete: `tests/e2e/motion-rollback.spec.ts`
- Delete or rewrite: `tests/e2e/app-motion-polish.spec.ts`
- Rename or rewrite: `tests/e2e/reader-motion.spec.ts`
- Delete or rewrite: `tests/e2e/motion-theme.spec.ts`
- Modify: `docs/E2E_TEST_CHECKLIST.md`
- Create: `docs/superpowers/audits/2026-07-19-motion-rollback-verification.md`

**Interfaces:**
- Consumes: completed rollback.
- Produces: proof that functionality remains while complex motion is absent.

- [ ] **Step 1: Write final browser acceptance tests**

`motion-rollback.spec.ts` must cover:

1. Spam Crawl → Library → Tasks → Settings; exactly one page heading/content tree is present after each click.
2. Library → Detail → Back; no duplicate cover/title and no route surface wrapper.
3. Tasks → Detail → Back; status and actions remain usable.
4. Enter and exit Reader; one Reader surface, anchor restored, Detail remains usable after Back.
5. BottomSheet close by X, overlay, Escape, and long downward swipe from header.
6. Short sheet swipe leaves sheet open and visually stationary.
7. Vertical scrolling inside sheet and Reader is not blocked.
8. Reduced-motion mode preserves identical functionality.
9. Keyboard focus reaches dialogs and returns correctly.
10. No element in the DOM exposes `data-route-surface`, `data-route-visual-layer`, or `data-shared-layout-id`.

Use stable semantic selectors, not assumptions about animation frame timing.

- [ ] **Step 2: Delete tests whose only purpose was measuring removed animation**

Remove assertions for:

- transform interpolation;
- shared endpoint distance;
- layout identity count;
- spring settle frames;
- route opacity sampling;
- bundle cost of Motion.

Retain and relocate functional assertions for navigation, Reader, BottomSheet, focus, and reduced motion.

- [ ] **Step 3: Run static and test suites**

```bash
npm run check:lockfile
npm run check
npm run test:regression
npm run test:integration
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Run browser suites**

```bash
npx playwright test tests/e2e/motion-rollback.spec.ts --project="Mobile Chrome"
npx playwright test tests/e2e/motion-rollback.spec.ts --project="Desktop Chrome"
npx playwright test tests/e2e/app-shell.spec.ts --project="Mobile Chrome"
npx playwright test tests/e2e/app-shell.spec.ts --project="Desktop Chrome"
```

If the project names differ, use `npx playwright test --list` and substitute the exact configured names.

- [ ] **Step 5: Measure dependency/bundle removal**

Record in the audit:

```bash
du -b apps/web/dist/assets/*.js
```

Compare the total JS and gzip sizes with the last motion-enabled audit where available. The acceptance criterion is not a fixed percentage; the `motion` dependency must be absent and the bundle must not increase.

- [ ] **Step 6: Write verification audit**

Document:

- files/modules deleted;
- behavior retained;
- test counts;
- bundle delta;
- browser environments used;
- explicit note that physical Android validation is still required if only emulation was available.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e docs/E2E_TEST_CHECKLIST.md \
  docs/superpowers/audits/2026-07-19-motion-rollback-verification.md
git commit -m "test: verify motion rollback"
```

---

## Final Acceptance Checklist

- [ ] `motion` and `framer-motion` are absent from dependencies and lockfile.
- [ ] `apps/web/src/shared/lib/motion/` is deleted.
- [ ] App renders the current React Router outlet directly.
- [ ] No retained route page, shared layout identity, visual snapshot, transition token, or motion activity owner remains.
- [ ] BottomSheet has no inline gesture transform, spring, velocity, or animation controller.
- [ ] Reader content never follows the finger; swipe invokes chapter navigation only after release.
- [ ] Reader anchor, progress, buttons, keyboard navigation, focus, and Back behavior remain correct.
- [ ] Radix focus trap, Escape, overlay click, portals, and toast lifecycle remain correct.
- [ ] Safe CSS transitions respect `prefers-reduced-motion`.
- [ ] Repository guards prevent JavaScript animation engines from returning silently.
- [ ] Static checks, regression, integration, production build, mobile E2E, and desktop E2E pass.
