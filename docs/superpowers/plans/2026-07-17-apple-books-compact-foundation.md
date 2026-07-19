# Apple Books Compact Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mixed visual foundation with one Apple Books Compact token contract without changing feature behavior.

**Architecture:** CSS custom properties remain the runtime source of truth. `apps/web/src/design/tokens.ts` exposes typed token names for TypeScript consumers and documentation, while shared primitives continue consuming the CSS variables. This phase changes foundation values and ownership only; feature composition migration belongs to later phases.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, CSS custom properties, Node test runner.

## Global Constraints

- Preserve Reader-specific typography preferences.
- Preserve minimum 44px touch targets.
- Do not alter route, state, API, or backend behavior.
- Use only the canonical spacing, radius, motion, icon, typography, elevation, and semantic color contracts.

---

### Task 1: Lock the token contract

**Files:**
- Create: `tests/regression/ui-apple-books-foundation.test.ts`
- Create: `apps/web/src/design/tokens.ts`
- Modify: `apps/web/src/shared/theme/{typography,spacing,radius,motion,size,elevation}.css`
- Modify: `apps/web/tailwind.config.ts`

**Interfaces:**
- Produces: `designTokens` and CSS variables consumed by shared UI primitives.

- [x] Write a failing regression test for the Apple Books Compact contract.
- [x] Run the test and confirm the legacy token scale fails it.
- [x] Implement the canonical token values and typed token map.
- [x] Run the target test and full verification.

### Task 2: Document ownership and remove legacy aliases

**Files:**
- Modify: `apps/web/src/shared/theme/README.md`
- Modify: `apps/web/src/shared/theme/VISUAL_STYLE_GUIDE.md`

**Interfaces:**
- Consumes: canonical contract from Task 1.
- Produces: one documented authority for future primitive and page work.

- [x] Document role usage and prohibited direct values.
- [x] Remove unused radius and spacing aliases.
- [x] Verify no web source references removed aliases.
