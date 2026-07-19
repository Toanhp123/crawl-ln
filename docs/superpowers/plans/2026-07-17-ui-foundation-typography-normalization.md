# UI Foundation Typography Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a single semantic application type scale without allowing the app-font preference to resize layout geometry.

**Architecture:** Typography ownership stays in `shared/theme/typography.css`; shared `Text` variants expose the canonical roles consumed by pages and widgets. Reader typography remains independent through the existing reader tokens.

**Tech Stack:** React, TypeScript, Tailwind CSS, CSS custom properties, Node test runner.

## Global Constraints

- Do not change Reader typography behavior.
- App font preferences must change typography tokens only, never the root font size.
- Caption text must remain at least 12px at every app-font setting.
- Do not introduce page-specific pixel font-size utilities.

---

### Task 1: Canonicalize the application type scale

**Files:**
- Modify: `apps/web/src/shared/theme/typography.css`
- Test: `tests/regression/ui-foundation-typography-normalization.test.ts`

- [x] Add failing coverage for root-font scaling and semantic type roles.
- [x] Define caption, label, body, title, headline, display and metric tokens.
- [x] Override only typography tokens for app-font preferences.
- [x] Preserve existing Reader-specific typography settings.

### Task 2: Extend shared Text roles

**Files:**
- Modify: `apps/web/src/shared/ui/data-display/Text.tsx`
- Test: `tests/regression/ui-foundation-typography-normalization.test.ts`

- [x] Add `titleSm`, `headline`, `metricSm` and `metricLg` variants.
- [x] Bind every role to canonical size and line-height tokens.

### Task 3: Remove page-specific pixel font sizes

**Files:**
- Modify: typography consumers under `apps/web/src/features`, `pages`, `widgets` and `shared/ui`
- Test: `tests/regression/ui-foundation-typography-normalization.test.ts`

- [x] Replace numeric pixel font utilities with semantic token utilities.
- [x] Replace the matching hardcoded title line-height.
- [x] Verify no numeric `text-[Npx]` utility remains in application UI source.
