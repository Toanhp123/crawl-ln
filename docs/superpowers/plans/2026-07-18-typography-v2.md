# Typography V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make semantic `type-*` roles the only source of application UI font size and line height.

**Architecture:** Keep CSS custom properties and semantic classes in `shared/theme/typography.css` as the runtime source of truth. Migrate shared primitives first, then feature/page consumers, and add a regression scanner that rejects raw Tailwind typography sizing utilities.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3.4, class-variance-authority, Node test runner.

## Global Constraints

- Reader prose typography remains independently controlled by reader preferences.
- No route, API, persistence, or lifecycle behavior changes.
- Keep touch targets at least 44px.
- Add no dependency.

---

### Task 1: Add typography enforcement regression

**Files:**
- Create: `tests/regression/ui-typography-v2.test.ts`

**Interfaces:**
- Consumes: web TSX source files.
- Produces: a regression guard banning raw Tailwind font-size and line-height utilities.

- [ ] Write a test that scans every `.tsx` file under `apps/web/src` and rejects `text-xs` through `text-5xl`, fixed/arbitrary font-size classes, and all direct `leading-*` utilities.
- [ ] Run `node --import tsx --test tests/regression/ui-typography-v2.test.ts` and confirm failure on current source.

### Task 2: Make shared primitives semantic

**Files:**
- Modify: `apps/web/src/shared/theme/typography.css`
- Modify: `apps/web/src/shared/ui/data-display/Text.tsx`
- Modify: shared overlay, feedback, form, navigation, and data-display primitives reported by the regression.

**Interfaces:**
- Consumes: existing `type-*` classes.
- Produces: shared primitives with no raw font-size or line-height utilities.

- [ ] Add `reader-prose-preview` to `typography.css` for the reader preference sample.
- [ ] Remove redundant line-height utilities from `Text` variants because semantic classes already own line height.
- [ ] Migrate every shared primitive reported by the guard to `Text` or a semantic `type-*` class.
- [ ] Run the target regression and TypeScript check.

### Task 3: Migrate feature, widget, entity, and page consumers

**Files:**
- Modify: every TSX file reported by `ui-typography-v2.test.ts` outside `shared/ui`.

**Interfaces:**
- Consumes: shared `Text` and semantic classes.
- Produces: application feature code with no raw typography sizing utilities.

- [ ] Replace direct text-size and line-height utilities with the matching semantic role.
- [ ] Keep visual tone, weight, alignment, and tracking unchanged unless they duplicate a semantic role default.
- [ ] Run the target regression and web TypeScript check.

### Task 4: Verify and package

**Files:**
- Modify: documentation only if verification identifies a contract mismatch.

**Interfaces:**
- Consumes: migrated source.
- Produces: verified clean source archive.

- [ ] Run formatting and architecture checks.
- [ ] Run all regression and integration tests.
- [ ] Run production builds.
- [ ] Remove `node_modules`, `dist`, `.vite-temp`, and `tsbuildinfo`.
- [ ] Create `novel-tool-v2.9.6-typography-v2.zip`.
