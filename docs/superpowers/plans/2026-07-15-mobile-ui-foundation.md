# Mobile UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Standardize the Novel Tool web UI foundation and application shell against the approved mobile-first design system without changing business behavior.

**Architecture:** Keep the existing FSD boundaries. Theme files remain the source of semantic visual tokens, shared UI primitives consume those tokens, and app/widgets compose the primitives without page-specific styling leaks.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3, CSS custom properties, class-variance-authority, Radix Dialog, React Router, Lucide React.

## Global Constraints

- Preserve all routes, API calls, data flow, and page-level behavior.
- Support viewport widths from 320px upward.
- Maintain a minimum 44×44px interactive target.
- Use semantic CSS variables and preserve dark/light/accent themes.
- Add no new runtime dependency.
- Keep ordinary motion between 180ms and 220ms and honor reduced motion.

---

### Task 1: Normalize theme tokens

**Files:**
- Modify: `apps/web/src/shared/theme/colors.css`
- Modify: `apps/web/src/shared/theme/spacing.css`
- Modify: `apps/web/src/shared/theme/radius.css`
- Modify: `apps/web/src/shared/theme/typography.css`
- Modify: `apps/web/src/shared/theme/size.css`
- Modify: `apps/web/src/shared/theme/component-tokens.css`

- [x] Align semantic colors, 4px spacing scale, radius scale, mobile typography, shell sizing, and shared component values with the design spec.
- [x] Preserve existing variable names needed by current call sites.

### Task 2: Standardize shared controls and surfaces

**Files:**
- Modify: `apps/web/src/shared/ui/actions/Button.tsx`
- Modify: `apps/web/src/shared/ui/actions/IconButton.tsx`
- Modify: `apps/web/src/shared/ui/forms/Input.tsx`
- Modify: `apps/web/src/shared/ui/forms/SearchInput.tsx`
- Modify: `apps/web/src/shared/ui/forms/FilterChip.tsx`
- Modify: `apps/web/src/shared/ui/feedback/Badge.tsx`
- Modify: `apps/web/src/shared/ui/layout/Card.tsx`
- Modify: `apps/web/src/shared/ui/layout/Surface.tsx`
- Modify: `apps/web/src/shared/ui/layout/Page.tsx`
- Modify: `apps/web/src/shared/ui/layout/PageHeader.tsx`
- Modify: `apps/web/src/shared/ui/overlay/BottomSheet.tsx`

- [x] Apply consistent dimensions, states, focus rings, motion, and mobile ergonomics.
- [x] Keep existing public props compatible and add optional loading behavior to Button.

### Task 3: Upgrade app shell and navigation

**Files:**
- Modify: `apps/web/src/app/styles/index.css`
- Modify: `apps/web/src/shared/ui/layout/AppViewport.tsx`
- Modify: `apps/web/src/shared/ui/navigation/BottomNav.tsx`
- Modify: `apps/web/src/app/layouts/AppShell.tsx`
- Modify: `apps/web/src/widgets/app-header/ui/AppHeader.tsx`
- Modify: `apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx`

- [x] Make the app viewport a proper flex shell with safe-area behavior.
- [x] Center and constrain mobile navigation, improve active states, retain badges, and use 22px icons.
- [x] Refine the desktop header while preserving current routes and translations.

### Task 4: Verify and package

**Files:**
- Verify: `apps/web/src/**/*`

- [x] Run `npm run check -w @novel-tool/web` and resolve all failures.
- [x] Run `npm run build -w @novel-tool/web` and resolve all failures.
- [x] Package the modified project as a new zip without overwriting the source archive.
