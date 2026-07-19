# UI Foundation Semantic Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace arbitrary status-color opacity mixtures with one light/dark semantic interaction-state palette.

**Architecture:** `colors.css` owns every primary, success, warning, danger, info, focus, and selection state color. Tailwind exposes semantic aliases; components consume aliases and never calculate alpha values locally. `component-tokens.css` may compose semantic colors into gradients but does not define state colors.

**Tech Stack:** React, TypeScript, Tailwind CSS, CSS custom properties, Node test runner.

## Global Constraints

- Preserve existing accent selection and light/dark themes.
- Do not change layout, typography, elevation, or density.
- Do not introduce raw named Tailwind palette colors.
- Application source must not mix semantic status colors with arbitrary alpha values.

---

### Task 1: Protect semantic color ownership

**Files:**
- Create: `tests/regression/ui-foundation-semantic-color.test.ts`
- Modify: `tests/regression/ui-platform-audit.test.ts`

- [x] Add failing coverage for color ownership, light/dark tuning, and arbitrary alpha usage.
- [x] Confirm the test fails against Phase 3.

### Task 2: Create the semantic state palette

**Files:**
- Modify: `apps/web/src/shared/theme/colors.css`
- Modify: `apps/web/src/shared/theme/component-tokens.css`
- Modify: `apps/web/tailwind.config.ts`

- [x] Add light/dark subtle, hover, pressed, selected, border, focus, and selection tokens.
- [x] Add canonical Tailwind aliases.
- [x] Keep accent variants dynamic through the primary color channel.

### Task 3: Migrate component and feature usage

**Files:**
- Modify: `apps/web/src/shared/ui/**`
- Modify: `apps/web/src/features/**`
- Modify: `apps/web/src/pages/**`
- Modify: `apps/web/src/widgets/**`
- Modify: `apps/web/src/entities/**`

- [x] Replace arbitrary status alpha utilities with semantic aliases.
- [x] Replace direct status-color gradients with component gradient aliases.
- [x] Remove obsolete state utility classes.

### Task 4: Verify and document

**Files:**
- Modify: `apps/web/src/shared/theme/README.md`

- [x] Document semantic color ownership.
- [x] Run architecture, format, TypeScript, regression, integration, and production build checks.
- [x] Package a clean archive without dependencies or generated outputs.
