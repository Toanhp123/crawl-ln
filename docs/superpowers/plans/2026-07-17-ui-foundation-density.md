# UI Foundation Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make compact and comfortable density settings consistently control application controls, list rows, cards, panels, sections, and vertical layout rhythm without changing typography or reader content.

**Architecture:** Density remains a root theme preference exposed through `data-density`. Foundation files own density-specific size and spacing values; shared primitives consume semantic component tokens rather than embedding compact values. Reader typography and reader content layout remain independent.

**Tech Stack:** React, TypeScript, Tailwind CSS, CSS custom properties, Node test runner.

## Global Constraints

- Preserve minimum mobile touch targets of 44px in compact mode and 48px in comfortable mode.
- Do not change typography tokens in this phase.
- Do not change route, lifecycle, backend, or reader content behavior.
- Compact remains the default density for existing users.
- Shared primitives must consume semantic density tokens rather than branching on theme state in React.

---

### Task 1: Define canonical density contracts

**Files:**

- Modify: `apps/web/src/shared/theme/size.css`
- Modify: `apps/web/src/shared/theme/spacing.css`
- Modify: `apps/web/src/shared/theme/component-tokens.css`
- Test: `tests/regression/ui-foundation-density.test.ts`

- [x] Define compact and comfortable control sizes.
- [x] Define compact and comfortable page, section, and content spacing.
- [x] Define component padding, row height, and internal gap tokens.
- [x] Remove the unused `--density-space` token.

### Task 2: Migrate shared primitives

**Files:**

- Modify: `apps/web/src/shared/ui/layout/Card.tsx`
- Modify: `apps/web/src/shared/ui/layout/Panel.tsx`
- Modify: `apps/web/src/shared/ui/layout/Section.tsx`
- Modify: `apps/web/src/shared/ui/data-display/ListRow.tsx`
- Modify: `apps/web/src/shared/ui/layout/ResponsiveSplit.tsx`

- [x] Replace embedded compact padding and gaps with semantic density tokens.
- [x] Keep component variants while allowing density to scale each variant.
- [x] Preserve visual hierarchy and accessibility.

### Task 3: Document and verify

**Files:**

- Modify: `apps/web/src/shared/theme/README.md`
- Test: `tests/regression/ui-foundation-density.test.ts`

- [x] Document density ownership and scope.
- [x] Run architecture, format, type, regression, integration, and production build checks.
