# Phase 1 Implementation Plan — Design System 2.0 and App Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Every behavior change follows red-green-refactor.

**Goal:** Establish the complete visual and interaction foundation required by all later phases without changing feature behavior.

**Architecture:** Extend the current CSS-token system, normalize shared UI contracts, and rebuild the application shell around a four-destination mobile navigation model. Existing screens continue rendering through compatibility-safe primitives while later phases migrate page-specific layouts.

**Tech stack:** React 18, TypeScript, Tailwind CSS 3, Radix UI, CSS custom properties, CVA, Lucide React, React Router 7.

## Phase constraints

- No crawler, task, novel, chapter, or API behavior changes.
- No page-specific visual value may be added to shared components.
- Keep Vite execution through `node ./node_modules/vite/bin/vite.js`.
- Prefer CSS motion; do not add a motion dependency in this phase.
- All existing routes remain valid.
- Bottom navigation contains Crawl, Library, Tasks, and Settings only.

---

## Task 1.1 — Freeze UI contracts with regression tests

**Files**
- Modify: `tests/regression/ui-platform-audit.test.ts`
- Modify: `tests/regression/app-shell-spacing.test.ts`
- Create: `tests/regression/design-system-v2.test.ts`
- Create: `tests/regression/mobile-navigation.test.ts`

**Coverage**
- required token files exist
- semantic tokens are exported
- minimum control size is 48 px
- bottom navigation has four destinations
- Reader is excluded from persistent tabs
- safe-area variables are used
- reduced-motion media query exists
- page components do not hard-code hex/rgb colors

**Steps**
- [ ] Add a failing test asserting the presence of `motion.css`, `z-index.css`, `opacity.css`, and `elevation.css`.
- [ ] Run `npm run test:regression`; verify failure names the missing files.
- [ ] Add a failing test that scans page and feature TSX files for raw hex, rgb, or hsl color literals.
- [ ] Run the focused regression file and verify the intended failure.
- [ ] Add a failing test asserting four bottom-navigation route definitions and no Reader tab.
- [ ] Run the focused test and verify it fails against the current navigation.
- [ ] Commit only the red tests.

**Acceptance**
The new regression files fail for the intended missing Phase 1 behavior and do not fail because of syntax or path errors.

---

## Task 1.2 — Complete primitive and semantic token layers

**Files**
- Create: `apps/web/src/shared/theme/motion.css`
- Create: `apps/web/src/shared/theme/z-index.css`
- Create: `apps/web/src/shared/theme/opacity.css`
- Create: `apps/web/src/shared/theme/elevation.css`
- Modify: `apps/web/src/shared/theme/colors.css`
- Modify: `apps/web/src/shared/theme/spacing.css`
- Modify: `apps/web/src/shared/theme/radius.css`
- Modify: `apps/web/src/shared/theme/typography.css`
- Modify: `apps/web/src/shared/theme/size.css`
- Modify: `apps/web/src/shared/theme/component-tokens.css`
- Modify: `apps/web/src/shared/theme/index.css`
- Modify: `apps/web/src/shared/theme/README.md`

**Required token contracts**
- motion: `--duration-instant`, `--duration-fast`, `--duration-standard`, `--duration-sheet`, `--ease-standard`, `--ease-emphasized`
- z-index: `--z-base`, `--z-sticky`, `--z-nav`, `--z-overlay`, `--z-modal`, `--z-toast`
- opacity: disabled, muted, scrim, hover, pressed
- elevation: none, low, medium, high
- semantic surfaces: canvas, surface, surface-subtle, surface-elevated
- semantic text: primary, secondary, muted, inverse
- semantic border: subtle, default, strong
- status roles: accent, information, success, warning, danger
- focus ring
- navigation dimensions including safe-area-aware total height
- control heights of 48 and 56 px
- reader width and typography aliases reserved for Phase 3

**Steps**
- [ ] Implement primitive token files with light-mode defaults.
- [ ] Add dark-mode semantic overrides without duplicating primitive numeric scales.
- [ ] Import token files in deterministic order from `index.css`.
- [ ] Map existing component variables to the new semantic values to preserve current pages.
- [ ] Document which layer may be consumed by pages.
- [ ] Run `npm run test:regression`.
- [ ] Run `npm run check -w @novel-tool/web`.
- [ ] Visually confirm no baseline screen loses readable contrast.
- [ ] Commit token implementation.

**Acceptance**
- Regression token tests pass.
- Existing UI remains usable before component migration.
- No page requires primitive color knowledge.

---

## Task 1.3 — Normalize shared layout primitives

**Files**
- Modify: `apps/web/src/shared/ui/layout/Page.tsx`
- Modify: `apps/web/src/shared/ui/layout/PageHeader.tsx`
- Modify: `apps/web/src/shared/ui/layout/Section.tsx`
- Modify: `apps/web/src/shared/ui/layout/Card.tsx`
- Modify: `apps/web/src/shared/ui/layout/Stack.tsx`
- Modify: `apps/web/src/shared/ui/layout/AppViewport.tsx`
- Create: `apps/web/src/shared/ui/layout/Surface.tsx`
- Create: `apps/web/src/shared/ui/layout/StickyActionBar.tsx`
- Modify: `apps/web/src/shared/ui/index.ts`

**Interfaces**
- `Page`: controls page gutter, top spacing, bottom navigation clearance, and optional maximum width.
- `PageHeader`: title, description, leading action, trailing actions, sticky mode.
- `Surface`: semantic surface and elevation variants.
- `StickyActionBar`: safe-area-aware bottom actions for pages, never used inside Reader immersive mode.

**Steps**
- [ ] Add component-level tests or regression assertions for valid variants and safe-area classes.
- [ ] Verify the new tests fail before implementation.
- [ ] Implement `Surface` with semantic variants only.
- [ ] Implement `StickyActionBar` with single-action and dual-action layouts.
- [ ] Update `Page` to use navigation-clearance tokens rather than fixed padding.
- [ ] Update `PageHeader` to maintain 48 px control targets.
- [ ] Export new components from the shared UI barrel.
- [ ] Run web type-check and regression tests.
- [ ] Commit layout primitives.

**Acceptance**
All page layouts can be built without custom safe-area padding or local surface colors.

---

## Task 1.4 — Normalize action, form, and feedback primitives

**Files**
- Modify: `apps/web/src/shared/ui/actions/Button.tsx`
- Modify: `apps/web/src/shared/ui/actions/IconButton.tsx`
- Modify: `apps/web/src/shared/ui/forms/Input.tsx`
- Modify: `apps/web/src/shared/ui/forms/SearchInput.tsx`
- Modify: `apps/web/src/shared/ui/forms/SegmentedControl.tsx`
- Modify: `apps/web/src/shared/ui/feedback/Badge.tsx`
- Modify: `apps/web/src/shared/ui/feedback/Progress.tsx`
- Modify: `apps/web/src/shared/ui/feedback/Skeleton.tsx`
- Modify: `apps/web/src/shared/ui/feedback/EmptyState.tsx`
- Modify: `apps/web/src/shared/ui/feedback/ErrorState.tsx`
- Modify: `apps/web/src/shared/ui/feedback/LoadingState.tsx`
- Create: `apps/web/src/shared/ui/feedback/StatusDot.tsx`
- Create: `apps/web/src/shared/ui/feedback/InlineNotice.tsx`
- Create: `apps/web/src/shared/ui/forms/FilterChip.tsx`
- Modify: `apps/web/src/shared/ui/index.ts`

**Required variants**
- Button: primary, secondary, outline, ghost, danger; sizes standard and large
- IconButton: standard and compact visual sizes while preserving a 48 px hit area
- Badge: neutral, information, success, warning, danger
- Progress: determinate and indeterminate; accessible value labels
- Empty/Error/Loading: compact and full-page modes
- FilterChip: selected, unselected, disabled

**Steps**
- [ ] Write failing regression assertions for 48 px controls and accessible labels.
- [ ] Update components using CVA variants and semantic tokens.
- [ ] Ensure loading buttons preserve width and expose `aria-busy`.
- [ ] Ensure icon-only buttons require `aria-label` at the TypeScript interface level.
- [ ] Implement status and filter primitives.
- [ ] Add reduced-motion behavior for skeleton and indeterminate progress.
- [ ] Run type-check, regression, and build.
- [ ] Commit shared controls.

**Acceptance**
Later phases require no new foundational button, chip, notice, loading, or status primitive.

---

## Task 1.5 — Standardize overlays

**Files**
- Modify: `apps/web/src/shared/ui/overlay/BottomSheet.tsx`
- Modify: `apps/web/src/shared/ui/overlay/Drawer.tsx`
- Modify: `apps/web/src/shared/ui/overlay/Modal.tsx`
- Modify: `apps/web/src/shared/ui/overlay/ConfirmDialog.tsx`
- Modify: `apps/web/src/shared/ui/feedback/Toast.tsx`

**Behavior**
- Mobile selection and secondary actions prefer BottomSheet.
- Destructive confirmation remains ConfirmDialog.
- Sheets use safe-area padding and a visible drag affordance without requiring drag gestures.
- Focus is trapped and restored through Radix.
- Escape and overlay dismissal follow explicit component props.
- Toast position clears bottom navigation and safe area.

**Steps**
- [ ] Add failing regression assertions for safe-area and focus-related Radix usage.
- [ ] Align overlay surfaces, radii, scrim, z-index, and motion tokens.
- [ ] Implement reduced-motion fallbacks.
- [ ] Ensure long sheet content scrolls internally without moving the background.
- [ ] Verify keyboard focus and escape handling manually.
- [ ] Run regression, type-check, and build.
- [ ] Commit overlay normalization.

**Acceptance**
Every later page can use one overlay implementation without local viewport or z-index fixes.

---

## Task 1.6 — Rebuild application shell and navigation

**Files**
- Modify: `apps/web/src/app/layouts/AppShell.tsx`
- Modify: `apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx`
- Modify: `apps/web/src/shared/ui/navigation/BottomNav.tsx`
- Modify: `apps/web/src/widgets/app-header/ui/AppHeader.tsx`
- Modify: `apps/web/src/app/router/AppRouter.tsx`
- Create: `apps/web/src/app/layouts/ReaderShell.tsx`
- Create: `apps/web/src/shared/lib/useMediaQuery.ts`
- Modify: `apps/web/src/app/styles/index.css`

**Navigation contract**
- four persistent items: Crawl, Library, Tasks, Settings
- task badge sourced from existing task query data or a dedicated lightweight selector
- Reader routes render through `ReaderShell`
- regular routes render through `AppShell`
- bottom navigation hidden on Reader
- larger screens may use a navigation rail, but the mobile route order remains unchanged

**Steps**
- [ ] Make mobile-navigation regression tests fail against the current shell.
- [ ] Implement route metadata as a typed constant rather than duplicated JSX.
- [ ] Implement four-item bottom navigation.
- [ ] Add active state using `NavLink`.
- [ ] Add task badge with accessible text.
- [ ] Split Reader shell from regular shell.
- [ ] Add page-bottom clearance at shell level.
- [ ] Add desktop rail behavior only after mobile behavior passes.
- [ ] Run regression and Playwright discovery.
- [ ] Add/update E2E assertions for navigation visibility and Reader shell.
- [ ] Commit shell migration.

**Acceptance**
- Four primary routes are reachable with one tap.
- Reader does not show persistent bottom navigation.
- No page owns shell spacing.
- Navigation is usable at 320 px.

---

## Task 1.7 — Establish page-state composition patterns

**Files**
- Create: `apps/web/src/shared/ui/feedback/QueryStateBoundary.tsx`
- Create: `apps/web/src/shared/ui/feedback/RefreshIndicator.tsx`
- Modify: `apps/web/src/shared/ui/index.ts`
- Update selected pages only to prove compatibility:
  - `apps/web/src/pages/library/ui/LibraryPage.tsx`
  - `apps/web/src/pages/tasks/ui/TasksPage.tsx`

**Behavior**
- initial loading can replace content
- background refresh preserves successful content
- empty state is distinct from loading
- retry callback is explicit
- stale content can remain visible with a refresh indicator

**Steps**
- [ ] Add a failing test for loading/empty/error precedence.
- [ ] Implement `QueryStateBoundary` as a presentation helper without importing TanStack Query.
- [ ] Implement refresh indicator.
- [ ] Migrate Library and Tasks only enough to validate the pattern without redesigning them.
- [ ] Run regression and build.
- [ ] Commit state composition.

**Acceptance**
The same state precedence can be reused in Phases 2 and 3 without page-specific conditional pyramids.

---

## Task 1.8 — Theme runtime and accessibility hardening

**Files**
- Modify: `apps/web/src/shared/theme/runtime/ThemeProvider.tsx`
- Modify: `apps/web/src/app/styles/index.css`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/shared/i18n/locales/en.ts`
- Modify: `apps/web/src/shared/i18n/locales/vi.ts`

**Behavior**
- theme values remain persisted
- system theme changes update when mode is `system`
- focus-visible style is global and clear
- reduced-motion preference is applied
- root includes correct color-scheme behavior
- route changes focus the main heading or main landmark where appropriate

**Steps**
- [ ] Add failing regression checks for reduced motion and focus-visible styling.
- [ ] Update provider behavior without changing stored preference keys.
- [ ] Add a skip link and main-content target.
- [ ] Add translated accessible navigation labels.
- [ ] Run regression, type-check, and build.
- [ ] Commit accessibility runtime.

**Acceptance**
Keyboard, screen-reader structure, theme switching, and motion preferences work before page redesign begins.

---

## Task 1.9 — Phase 1 E2E and visual verification

**Files**
- Modify: `tests/e2e/app-shell.spec.ts`
- Create: `tests/e2e/design-system-mobile.spec.ts`
- Modify: `playwright.config.ts` only when device projects are missing
- Modify: `.github/workflows/ci.yml` if required to run all projects

**Viewport matrix**
- 320 × 640
- 360 × 800
- 390 × 844
- tablet portrait
- desktop

**E2E paths**
- navigate all four primary tabs
- confirm Reader hides bottom navigation
- open and close a bottom sheet
- verify focus restoration
- switch light/dark appearance
- verify no horizontal overflow
- verify task badge does not break navigation width

**Steps**
- [ ] Write failing E2E expectations for the new shell.
- [ ] Run locally where browser is available or run in CI.
- [ ] Fix only Phase 1 defects.
- [ ] Run the complete release gate.
- [ ] Review bundle-size difference.
- [ ] Update `CHANGELOG.md` and version to `2.1.0-alpha.1`.
- [ ] Tag Phase 1 only after CI passes.

## Phase 1 exit criteria

- Every Phase 1 task is complete.
- No later-phase page redesign is partially introduced.
- All baseline functionality remains reachable.
- Design-system regression tests pass.
- Mobile shell E2E passes.
- No critical accessibility issue in shell or shared components.
- Production build succeeds.
