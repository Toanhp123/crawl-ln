# Novel Tool UI/UX Mobile Upgrade — Master Specification

**Baseline:** Novel Tool `2.0.4`  
**Target:** Mobile-first UI/UX upgrade delivered through four independently verifiable phases  
**Primary platform:** Android/Termux-hosted web application, mobile browsers first  
**Architecture:** React, TypeScript, Vite, Tailwind CSS, Radix UI, TanStack Query, Feature-Sliced Design

## 1. Purpose

The upgrade converts the current application from a responsive desktop-style interface into a coherent mobile application experience without changing crawler, storage, or API business behavior.

The interface uses a hybrid product language:

- Crawl and Tasks behave like technical operational dashboards.
- Library and Reader remain quiet, content-first, and distraction-free.
- Settings and navigation use consistent mobile controls and one-hand reachability.
- Every screen uses the same tokens, states, motion rules, accessibility rules, and component contracts.

## 2. Non-negotiable constraints

1. Preserve all routes and API contracts unless a phase explicitly documents an additive change.
2. Preserve the current Feature-Sliced Design dependency direction.
3. No page may import another page.
4. Shared UI may not depend on entities, features, widgets, or pages.
5. Entity UI may not contain page-specific orchestration.
6. Touch targets must be at least 48 CSS pixels.
7. The primary content width must remain usable from 320 px through desktop widths.
8. Safe-area insets must be respected at the top and bottom.
9. Light mode, dark mode, Vietnamese, and English must remain supported.
10. Reduced-motion preferences must be respected.
11. No hard-coded visual colors in page or feature components; semantic tokens are required.
12. The baseline release gate remains:
    - `npm run check:lockfile`
    - `npm run check`
    - `npm run test:regression`
    - `npm run test:integration`
    - `npm run build`
13. Each phase must add or update regression coverage before production implementation.
14. Each phase must be independently shippable and must not leave placeholders.
15. Termux-compatible CLI invocation must remain intact; do not restore direct executable shims for Vite.

## 3. Information architecture

### Persistent primary destinations

- `/crawl`
- `/library`
- `/tasks`
- `/settings`

### Contextual destination

- `/reader/:novelId`
- `/reader/:novelId/:chapterIndex`

Reader is contextual and is not a fifth persistent bottom-navigation item. It is entered through Library or chapter actions and provides its own back navigation. This prevents overcrowding and keeps the bottom navigation within four high-confidence destinations.

### Navigation behavior

- Bottom navigation is visible on Crawl, Library, Tasks, and Settings.
- Bottom navigation is hidden in immersive Reader mode.
- Task badge represents active plus queued tasks, capped visually at `99+`.
- Current tab uses icon, label, and semantic active surface.
- Desktop widths may transform the same destinations into a side rail without changing route semantics.

## 4. Visual direction

### Operational surfaces

Crawl and Tasks use:

- compact metrics
- explicit statuses
- progress indicators
- structured cards
- expandable diagnostics
- strong action hierarchy

### Reading surfaces

Library and Reader use:

- larger typography
- reduced chrome
- generous content spacing
- subdued metadata
- high-quality empty and loading states
- minimal interruption

## 5. Design system architecture

The design system remains under `apps/web/src/shared/theme` and `apps/web/src/shared/ui`.

### Token layers

1. **Primitive tokens**
   - numeric spacing scale
   - radius scale
   - type scale
   - duration and easing
   - opacity
   - z-index
2. **Semantic tokens**
   - canvas, surface, elevated surface
   - text primary, secondary, muted, inverse
   - border subtle, standard, strong
   - accent, success, warning, danger, information
   - focus ring
3. **Component tokens**
   - button height and padding
   - card radius and elevation
   - bottom-navigation dimensions
   - input height
   - sheet radius
   - reader-specific widths and themes

Pages consume semantic or component tokens only.

## 6. State model

Every data-bearing screen must explicitly support:

- initial loading
- background refreshing
- empty
- partial data
- recoverable error
- destructive error
- offline or unreachable API
- success confirmation

Loading must preserve layout where possible through skeletons. Refreshing must not replace existing successful content with a blank spinner.

## 7. Motion model

Motion is functional, not decorative.

- Fast feedback: 120–160 ms
- Standard transitions: 180–240 ms
- Sheets and drawers: 220–320 ms
- No animation longer than 400 ms
- Reduced-motion mode removes transforms and nonessential transitions
- Route changes use subtle opacity/translation only
- Progress values animate only when the value change is meaningful

A motion library may be introduced only if native CSS and Radix behavior are insufficient. The default implementation should prefer CSS transitions to reduce bundle size and Termux installation cost.

## 8. Accessibility baseline

- WCAG AA contrast for text and interactive controls
- visible keyboard focus
- semantic headings and landmarks
- live regions for task and crawl state changes
- icon-only controls require accessible labels
- dialogs and sheets restore focus correctly
- bottom navigation exposes current-page semantics
- reader tap zones must have equivalent visible controls
- no gesture-only required action
- minimum 48 px interactive size
- no information communicated by color alone

## 9. Performance budget

Measured on a mid-range Android device:

- initial web bundle increase from Phase 1 must stay below 40 KB gzip unless approved
- no unbounded DOM list for chapters or large task history
- cover images use lazy loading and fixed aspect ratio
- route-level components may be lazy-loaded
- no continuous polling faster than the existing API needs
- reader interactions must not trigger full chapter-list rerenders
- layout shift should be minimized through reserved skeleton dimensions

## 10. Delivery sequence

### Phase 1 — Design System 2.0 and App Shell
Establish tokens, primitives, shared states, navigation, responsive shell, and regression contracts.

### Phase 2 — Operational Dashboards
Rebuild Crawl and Tasks using the Phase 1 system without changing crawler or task API contracts.

### Phase 3 — Library and Reader
Rebuild discovery and reading experiences, including reader chrome, chapter navigation, local preferences, and progress presentation.

### Phase 4 — Settings, polish, accessibility, and performance
Complete all settings groups, unify states, improve responsive behavior, audit accessibility, optimize runtime behavior, and run final end-to-end verification.

## 11. Versioning strategy

- Phase 1 candidate: `2.1.0-alpha.1`
- Phase 2 candidate: `2.1.0-beta.1`
- Phase 3 candidate: `2.1.0-rc.1`
- Phase 4 final: `2.1.0`

Version changes occur only after the phase passes its acceptance gate.

## 12. Global release gate

A phase is not complete until all applicable commands pass:

```bash
npm ci
npm run check:lockfile
npm run check
npm run test:regression
npm run test:integration
npm run build
npm run test:e2e
npm audit
```

When Playwright browser installation is unavailable locally, CI execution is mandatory before declaring the phase releasable.

## 13. Rollback policy

Each phase is implemented in an isolated branch or worktree and merged only after verification. A phase must not depend on unmerged code from a later phase. The previous tagged phase remains runnable, enabling direct rollback without database migration.

## 14. Completion definition

The overall upgrade is complete only when:

- all four phases meet their own acceptance criteria
- no old component remains solely because the new system omitted its behavior
- Crawl, Library, Tasks, Settings, and Reader pass mobile E2E paths
- Vietnamese and English copy are complete
- light and dark mode are visually reviewed
- 320 px, 360 px, 390 px, tablet, and desktop layouts are checked
- no critical or high accessibility issue remains
- build and audit gates pass
