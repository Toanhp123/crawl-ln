# Motion Rollback Design

## Status

Approved design for removing the complex application motion system while preserving stable, accessible UI behavior.

## Goal

Return Novel Tool to a predictable, easy-to-debug UI by removing JavaScript animation, route presence, shared-element transitions, and spring physics. Keep only small CSS transitions that cannot retain old page trees, interfere with layout, or own navigation lifecycle.

## Product Decision

The selected rollback level is **B: remove all complex motion and keep only safe CSS transitions**.

The resulting application should feel responsive but mostly static:

- route and tab changes render immediately;
- no page tree is retained for exit animation;
- no shared cover, title, or status morphing;
- no spring, rubber band, or velocity-based animation;
- Radix primitives keep their accessibility and lifecycle;
- hover, focus, color, opacity, spinner, and very short overlay transitions may remain.

## Non-Goals

This rollback does not redesign the UI, change business behavior, change query behavior, alter reader persistence, or introduce a replacement animation library.

The following are explicitly out of scope:

- new route transitions;
- shared-element transitions;
- View Transition API;
- page curl;
- physics-based gestures;
- animated list reordering;
- content choreography;
- visual polish beyond removing broken motion behavior.

## Core Principles

### One route tree

React Router renders only the current route. No outgoing route surface remains mounted for animation.

### CSS only

Permitted motion is implemented with CSS transitions or CSS keyframes. No JavaScript animation engine is used.

### Lifecycle belongs to the component library

Radix continues to own mounting, focus trap, Escape handling, portal behavior, and `open` / `closed` state. CSS may style those states but must not delay or override lifecycle with JavaScript timers.

### Functional gestures are separate from animation

A gesture may still trigger an action, such as dismissing a BottomSheet or navigating chapters, but the content does not track the finger with spring physics.

### Accessibility over visual continuity

Reduced motion, focus order, keyboard navigation, screen-reader state, and pointer safety are more important than preserving any visual transition.

## Architecture After Rollback

```text
React Router / current route only
        ↓
Pages, widgets, and features
        ↓
Shared UI primitives
        ↓
Safe CSS state transitions
```

The following architecture is removed:

```text
AppMotionProvider
RouteMotionCoordinator
motion/react adapter
motion theme JS presets
route transition context
motion activity ownership
shared layout identities
motion values and springs
```

## Dependency Removal

Remove the `motion` package from:

- `apps/web/package.json`;
- the root lockfile;
- source imports and exports.

No other animation package is added.

A repository guard must fail if `motion`, `framer-motion`, or direct Web Animations usage is added without an explicit future design decision.

## Route and Navigation Behavior

### Tabs

Switching among Crawl, Library, Tasks, and Settings updates the active route immediately.

Keep:

- active color;
- active icon state;
- focus and aria-current state;
- a static indicator or background highlight.

Remove:

- moving tab indicator;
- icon crossfade through Motion;
- page translation;
- page opacity transition;
- retained outgoing pages.

### Hierarchical navigation

Library → Novel Detail, Tasks → Task Detail, and back navigation render the destination immediately.

Remove:

- push/pop page translation;
- visual-layer wrappers;
- transition descriptors and tokens;
- interaction locks caused by route animation;
- any route-level `pointer-events: none` behavior.

### Reader route

Novel Detail remains the normal parent route according to the existing router topology, but Reader must not depend on route animation or background visual layers.

Keep:

- reader portal if required by layout;
- focus restoration;
- reading anchor persistence;
- reader data and navigation logic.

Remove:

- Reader enter/exit animation;
- delayed content reveal;
- route-motion coordination;
- Reader opacity/translation animation.

## Shared Elements

Remove all shared layout identities and snapshot choreography:

- shared novel cover;
- shared novel title;
- shared task title;
- shared task status;
- transition snapshots used only for visual morphing.

Entity components may remain as ordinary presentational components if they are useful without Motion. Otherwise, inline or delete them according to existing FSD boundaries.

Navigation state must not contain visual-only snapshots after rollback.

## BottomSheet

### Required behavior

BottomSheet must remain fully usable through:

- close button;
- overlay click;
- Escape key;
- optional simple downward dismiss gesture.

### Simple gesture contract

The optional drag-to-dismiss implementation may use Pointer Events / Touch Events directly, but it must not animate continuously with the gesture.

Allowed behavior:

1. Record start position.
2. Detect a downward movement beyond a fixed threshold.
3. On release, call `onOpenChange(false)` immediately.
4. If below threshold, leave the sheet at its normal position.

The panel itself remains visually stationary while the gesture is evaluated.

The dismiss gesture must:

- work from the handle and header;
- avoid buttons, links, inputs, sliders, and scrollable content interactions;
- not block vertical content scrolling;
- not use velocity, spring, rubber band, or motion values;
- not write inline transforms during pointer movement.

### CSS lifecycle

A short CSS enter/exit is allowed only if it is independent of gesture state and cannot snap back.

Recommended safe default:

- overlay opacity: 120–160 ms;
- panel opacity: 120–160 ms;
- optional fixed 4–8 px translate on enter/exit;
- no reversal physics;
- reduced motion: 1 ms or no transition.

If even the fixed slide proves unreliable, use opacity only.

## Reader Interaction

### Chapter navigation

Keep chapter navigation functionality, but remove direct manipulation:

- no content following the finger;
- no edge preview translation;
- no spring-back;
- no commit animation.

A simple swipe detector may remain:

- detect horizontal distance;
- ignore vertical scrolling;
- invoke previous/next chapter after release;
- render the new chapter immediately.

Buttons and keyboard navigation continue to work.

### Reader chrome

Preferred rollback behavior:

- top and bottom controls show or hide immediately;
- `visibility`, `opacity`, or a short CSS transition may be used;
- content layout never moves when chrome toggles;
- hidden controls never intercept pointer events.

No Motion components or JavaScript animation callbacks are used.

### Reading preferences

Typography changes apply immediately while preserving the reading anchor through existing data/layout logic. No content crossfade or animated reflow.

## Radix Surfaces

Modal, Drawer, Dropdown, Popover, Tooltip, Toast, and BottomSheet continue using Radix state selectors.

Allowed:

- short opacity transitions;
- small fixed CSS translate for surface entrance;
- toast swipe behavior provided by Radix itself;
- loading spinner CSS keyframe.

Forbidden:

- JavaScript timers to mimic exit lifecycle;
- JavaScript transform ownership;
- spring or velocity calculations;
- retained invisible overlays;
- `transition: all`.

## Loading and Data States

### Skeleton

Keep a simple CSS pulse or static placeholder. It must not crossfade over live content.

### Initial loading

Render skeleton, then replace it with content immediately when ready. Layout dimensions should remain stable where practical.

### Background refetch

Keep existing content visible. Do not return to skeleton.

### Empty and error states

Render immediately. A short CSS opacity transition is optional but not required.

### Lists

Remove item enter, exit, reorder, collapse, and FLIP animation. Data updates render immediately while preserving keys, focus, and scroll behavior.

## Controls and Micro-Interactions

Keep only safe state styling:

- color transitions;
- border-color transitions;
- background-color transitions;
- focus-ring transitions where already used;
- toggle thumb CSS transform;
- progress width transition if it does not affect layout;
- spinner rotation.

Remove:

- press scale;
- icon morph through Motion;
- animated selection indicators;
- bookmark scale/crossfade choreography;
- animated list/status movement.

CSS transitions must use shared CSS variables. Component-local arbitrary duration or easing values remain forbidden.

## CSS Motion Tokens

The existing JavaScript motion theme is removed. A small CSS-only token set remains in `shared/theme/motion.css` or an equivalent theme file:

```css
--motion-instant: 1ms;
--motion-fast: 120ms;
--motion-normal: 160ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

Only safe CSS primitives consume these variables.

Reduced motion overrides all nonessential durations to `1ms` and disables decorative keyframes except an essential loading spinner when needed to communicate progress.

## Files Expected to Be Removed

The implementation should delete or fully retire these areas when no longer referenced:

```text
apps/web/src/app/providers/AppMotionProvider.tsx
apps/web/src/app/providers/RouteMotionCoordinator.tsx
apps/web/src/shared/lib/motion/engine.ts
apps/web/src/shared/lib/motion/motionActivity.ts
apps/web/src/shared/lib/motion/presets.ts
apps/web/src/shared/lib/motion/routeGraph.ts
apps/web/src/shared/lib/motion/routeMotion.ts
apps/web/src/shared/lib/motion/routeTransition.ts
apps/web/src/shared/lib/motion/sharedElements.ts
apps/web/src/shared/lib/motion/theme.ts
apps/web/src/shared/lib/motion/useReducedMotion.ts
apps/web/src/shared/ui/navigation/TabMotionIndicator.tsx
```

`gesture.ts` may be deleted or replaced by a much smaller event-threshold helper only if it remains useful for simple chapter or sheet gestures.

## Files Expected to Be Simplified

At minimum:

```text
apps/web/src/main.tsx
apps/web/src/app/layouts/AppShell.tsx
apps/web/src/app/layouts/ReaderShell.tsx
apps/web/src/shared/ui/overlay/BottomSheet.tsx
apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx
apps/web/src/features/read-chapter/ui/ChapterSwipePreview.tsx
apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx
apps/web/src/pages/task-detail/ui/TaskDetailPage.tsx
apps/web/src/widgets/bottom-tabs/
apps/web/src/widgets/reader-toolbar/
apps/web/src/widgets/library-grid/
apps/web/src/widgets/task-list/
apps/web/src/shared/ui/feedback/ContentTransition.tsx
apps/web/src/shared/ui/forms/SegmentedControl.tsx
```

The implementation plan must inspect exact usages rather than deleting these components blindly.

## FSD Boundaries

The rollback must preserve the existing dependency direction:

```text
app → pages → widgets → features → entities → shared
```

Removing Motion must not move business logic into `shared` or cause entity components to import routing or page code.

## Testing Strategy

### Regression guards

Add or update guards to verify:

- no `motion` or `framer-motion` dependency;
- no `motion/react` imports;
- no `AnimatePresence`, `LayoutGroup`, `layoutId`, `useMotionValue`, or `animate(...)` API usage;
- no route-motion providers or contexts;
- no transition tokens or visual navigation snapshots;
- no `transition: all`;
- CSS duration/easing still use shared variables;
- BottomSheet does not write drag transforms;
- Reader swipe does not directly manipulate content position.

### Component and integration behavior

Verify:

- changing tabs leaves exactly one route tree;
- Detail and Task Detail remain aligned and interactive;
- Back/Forward works repeatedly;
- Reader opens and closes without duplicate portals;
- BottomSheet closes by X, overlay, Escape, and simple downward gesture;
- BottomSheet content scroll remains usable;
- chapter swipe triggers one navigation only;
- hidden reader chrome does not intercept pointer events;
- reduced motion has no visible route or gesture animation.

### Browser scenarios

Mobile and desktop checks should cover:

- rapid tab switching;
- Library → Detail → Back;
- Tasks → Detail → Back;
- Detail → Reader → Back;
- repeated Back/Forward;
- BottomSheet repeated open/close;
- BottomSheet downward touch gesture;
- scrolling inside BottomSheet;
- chapter swipe versus vertical reader scrolling;
- keyboard and focus behavior;
- reduced motion.

Frame sampling should confirm there is no ghost page, snap-back, teleport, or duplicate Reader surface. The expected route result is a direct replacement, not an animation.

## Migration Sequence

1. Add rollback regression guards and record baseline failures.
2. Remove route and application motion providers.
3. Remove shared-element and visual snapshot infrastructure.
4. Replace Motion-based tabs, details, lists, content transitions, and controls with static/CSS state.
5. Replace Reader motion and chapter direct manipulation with simple state/gesture behavior.
6. Replace BottomSheet physics with static panel plus optional threshold gesture.
7. Remove the `motion` dependency and dead files.
8. Simplify CSS tokens and reduced-motion rules.
9. Delete obsolete motion E2E/audits and replace them with stability-focused tests.
10. Run full static, regression, integration, production build, mobile, and desktop verification.

## Definition of Done

The rollback is complete only when:

1. The `motion` dependency is absent.
2. No JavaScript animation engine API remains in web source.
3. Only one current route tree is rendered.
4. No shared layout identities or transition snapshots remain.
5. Novel Detail and Task Detail remain aligned and interactive.
6. Reader never renders duplicate portals or loses its anchor.
7. BottomSheet can close by X, overlay, Escape, and the retained simple gesture.
8. BottomSheet never follows the pointer, springs, snaps back, or teleports.
9. Chapter navigation works without direct manipulation animation.
10. Safe CSS transitions use shared variables.
11. Reduced motion is respected.
12. Accessibility and focus behavior are unchanged or improved.
13. Static checks, regression, integration, and production build pass.
14. Mobile and desktop stability E2E pass.
15. No ghost pages, duplicate surfaces, stale pointer locks, or invisible overlays are observed.

## Future Policy

New animation may be reintroduced only through a separate design and implementation plan that proves:

- one owner for lifecycle and transform;
- no retained route trees;
- reduced-motion behavior;
- browser tests on interruption and rapid interaction;
- measurable UX value greater than the added complexity.
