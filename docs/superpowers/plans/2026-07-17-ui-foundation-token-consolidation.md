# UI Foundation Token Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Consolidate motion, elevation, and component tokens into one source of truth without changing typography or page layout.

**Architecture:** Foundation files own primitive token scales. `component-tokens.css` owns semantic component aliases only. `components.css` contains utility classes only and must not redefine tokens.

**Tech Stack:** CSS custom properties, Tailwind CSS, React, Node test runner.

## Global Constraints

- Preserve current visual behavior where duplicate declarations previously resolved by cascade.
- Do not change typography roles or responsive layout in this phase.
- Remove undefined shadow variables and duplicate motion/elevation systems.
- Keep reduced-motion behavior centralized in `motion.css`.

---

### Task 1: Add token ownership regression guard

**Files:**

- Create: `tests/regression/ui-foundation-token-consolidation.test.ts`

- [x] Assert component tokens are defined once.
- [x] Assert motion and elevation use one canonical naming system.
- [x] Assert undefined shadow aliases are absent from source.

### Task 2: Consolidate foundation tokens

**Files:**

- Modify: `apps/web/src/shared/theme/index.css`
- Modify: `apps/web/src/shared/theme/motion.css`
- Modify: `apps/web/src/shared/theme/elevation.css`
- Modify: `apps/web/src/shared/theme/component-tokens.css`
- Modify: `apps/web/src/shared/theme/components.css`
- Delete: `apps/web/src/shared/theme/shadows.css`

- [x] Move all motion values and reduced-motion overrides into `motion.css`.
- [x] Keep only `--elevation-0` through `--elevation-3` in `elevation.css`.
- [x] Keep component shape/size/state aliases in `component-tokens.css`.
- [x] Remove token declarations from `components.css`.

### Task 3: Migrate consumers

**Files:**

- Modify affected files under `apps/web/src`
- Modify: `apps/web/tailwind.config.ts`

- [x] Replace duration aliases with canonical motion tokens.
- [x] Replace shadow aliases and undefined variables with canonical elevation tokens.
- [x] Remove Tailwind shadow aliases that bypass the canonical scale.

### Task 4: Verify

- [x] Run formatting, architecture checks, TypeScript, regression, integration, and production builds.
- [x] Confirm the archive contains no generated outputs or dependencies.
