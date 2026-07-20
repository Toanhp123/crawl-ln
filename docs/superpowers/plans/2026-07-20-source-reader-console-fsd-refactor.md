# Source Reader Console FSD Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Refactor the Source Reader administration console into focused FSD slices, fix stale edit state, and tighten web contracts while preserving the existing UI system.

**Architecture:** Keep page/widget composition unchanged. Move inspection-specific transport and result rendering into its feature, split large feature UI files by responsibility, and keep all business request construction in pure model functions. Reuse the existing adaptive Drawer and shared UI primitives.

**Tech Stack:** React, TypeScript, TanStack Query, Radix Dialog, Node test runner, FSD architecture scripts.

## Global Constraints

- Dependency direction remains `pages -> widgets -> features -> entities -> shared`.
- Feature slices may not import another feature slice.
- Use only existing shared UI components, theme tokens and motion classes.
- Drawer is used for long administration forms; BottomSheet remains for short choice-oriented flows.
- Secret material is never hydrated from server metadata and is cleared whenever an overlay closes or a mutation settles.
- Every behavior change starts with a failing regression test.

---

### Task 1: Lock the desired architecture and state behavior

**Files:**

- Modify: `tests/regression/source-reader-web-console-fsd.test.ts`
- Modify: `tests/regression/source-reader-web-console-models.test.ts`
- Create: `tests/regression/source-reader-web-console-refactor.test.ts`

- [x] Add failing tests for profile reset, slice placement, overlay policy, file size and exact response typing.
- [x] Run the focused tests and confirm they fail for the missing refactor.

### Task 2: Refactor network profile administration

**Files:**

- Modify: `apps/web/src/features/manage-source-network-profile/model/networkProfileForm.ts`
- Create focused UI files for form, create, edit and actions.
- Delete: `apps/web/src/features/manage-source-network-profile/ui/ManageSourceNetworkProfile.tsx`

- [x] Implement `networkProfileFormFromProfile()`.
- [x] Split the UI and reset edit state on open/close.
- [x] Run focused tests until green.

### Task 3: Refactor credential administration

**Files:**

- Create: `apps/web/src/features/manage-source-credential/model/credentialForm.ts`
- Create focused secret editor/create/replace/delete UI files.
- Delete: `apps/web/src/features/manage-source-credential/ui/ManageSourceCredential.tsx`

- [x] Add pure create form state and request builders.
- [x] Split UI and clear all write-only values on close/settlement.
- [x] Run focused tests until green.

### Task 4: Move inspection into its feature

**Files:**

- Create feature-local API, model, controller and result UI files.
- Delete: `apps/web/src/entities/source-reader-result/**`

- [x] Move six HTTP operations and the dispatcher.
- [x] Move request/cursor logic into pure model functions.
- [x] Add a controller hook and presentational form.
- [x] Use `ScrollViewport as="div"` for bounded raw output.

### Task 5: Tighten shared web contracts

**Files:**

- Modify shared DTOs, Source Reader entity API clients and `ScrollViewport`.

- [x] Add exact create/activation result DTOs.
- [x] Remove broad management response types.
- [x] Keep `main` as the default ScrollViewport element while allowing `div`.

### Task 6: Verify and package

- [x] Run static gates, all regression shards, integration shards and production build.
- [x] Commit, verify Git integrity and package a clean ZIP with SHA-256.
