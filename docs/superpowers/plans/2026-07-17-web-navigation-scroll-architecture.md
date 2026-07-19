# Web Navigation & Scroll Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Reader entry and exit use deterministic, isolated scroll state so gesture Back and the in-app Back button return to Novel Detail without double animation, inherited reader scroll, or locked scrolling.

**Architecture:** AppShell and ReaderShell receive independent `overflow-y-auto` scroll viewports instead of sharing `window`. A router-level custom restoration controller owns AppShell scroll positions by React Router location key, while Reader calculations and persistence use the Reader viewport explicitly. Browser document restoration is disabled and global smooth scrolling is removed.

**Tech Stack:** React 18, React Router, TypeScript, Tailwind CSS, Node test runner.

## Global Constraints

- Preserve existing routes and backend contracts.
- Keep gesture Back and the Reader Back button on the same history POP path.
- History restoration must use `behavior: 'auto'`.
- Reader and App pages must never read or mutate `window.scrollY`.
- Existing reader cache, infinite window, and reading continuity behavior must remain intact.

---

### Task 1: Add regression coverage for scroll ownership

- [ ] Add source-level tests proving AppShell and ReaderShell use separate scroll roots.
- [ ] Add tests proving global smooth scroll is removed.
- [ ] Add tests proving Reader progress, anchors, observers, and persistence use the Reader viewport rather than `window`.
- [ ] Run the focused tests and confirm they fail before implementation.

### Task 2: Add shared scroll viewport and App restoration

- [ ] Create a shared scroll viewport context.
- [ ] Create AppShell scroll restoration keyed by `location.key`.
- [ ] Set browser history scroll restoration to manual.
- [ ] Make AppShell use a fixed-height shell with its own scrollable main area.

### Task 3: Move Reader scrolling off window

- [ ] Make ReaderShell own a fixed-height scroll viewport.
- [ ] Update reader progress and reading anchors to use that viewport.
- [ ] Update observers, scroll handlers, prepend compensation, restoration, and position saving.
- [ ] Keep Reader Back using history POP, with direct-entry fallback unchanged.

### Task 4: Verify and package

- [ ] Run architecture checks, formatting, TypeScript, regression tests, integration tests, and production builds.
- [ ] Remove dependencies and generated build outputs from the deliverable.
- [ ] Create and validate the final ZIP archive.
