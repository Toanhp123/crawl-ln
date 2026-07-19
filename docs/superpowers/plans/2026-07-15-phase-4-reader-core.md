# Phase 4 Reader Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver paragraph-based reading restoration and an immersive, themeable chapter reader.

**Architecture:** Stable paragraph IDs are emitted by the chapter entity. Capture and restore logic is isolated in the read-chapter feature, while ReaderPage coordinates persistence, chrome behavior, and prefetching. Reader themes override semantic tokens only inside the reader surface.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, Tailwind CSS, localStorage.

## Global Constraints

- Keep API contracts unchanged.
- Preserve FSD dependency direction.
- Preserve the legacy ratio-only reading position as a fallback migration path.
- Do not add a UI dependency.
- Verify with `npm run verify`.

---

### Task 1: Paragraph anchors and position storage

- [x] Add deterministic paragraph DOM IDs.
- [x] Add capture and restore utilities.
- [x] Add version 2 local storage with legacy migration.
- [x] Add regression coverage.

### Task 2: Immersive reader behavior

- [x] Restore anchors after content renders.
- [x] Debounce position persistence while scrolling.
- [x] Hide chrome on downward scrolling and show it on upward scrolling.
- [x] Toggle chrome by tapping outside controls.

### Task 3: Reader preferences and continuity

- [x] Add reader-only system, light, sepia, and dark schemes.
- [x] Scope semantic color overrides to the reader surface.
- [x] Prefetch the next available chapter.

### Task 4: Verification and packaging

- [x] Run the complete repository verification command.
- [x] Create a clean ZIP without node_modules.
- [x] Verify ZIP integrity.
