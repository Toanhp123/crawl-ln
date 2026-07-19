# Reader UX Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver an immersive, mobile-first reader with auto-hiding controls, clear progress, bookmark feedback, offline/error states, chapter navigation, TOC, and compact settings.

**Architecture:** Keep the existing reader engine, cache, reading-position storage, and FSD boundaries. Add focused reader presentation components and page-level orchestration only; do not change backend contracts.

**Tech Stack:** React, TypeScript, Tailwind, React Router, TanStack Query, existing shared UI primitives.

## Global Constraints

- Preserve chapter identity, cache versioning, infinite loading, and reading-position behavior.
- No backend or database changes.
- Keep components small and reader-specific.
- Add Vietnamese and English copy.

### Task 1: Reader chrome and controls
- Add auto-hide timer and tap-to-toggle behavior.
- Improve toolbar and bottom bar with chapter title, book progress, chapter progress, and previous/next controls.

### Task 2: Feedback states
- Add offline indicator, actionable load failure state, bookmark toast, loading transition, and end-of-book card.

### Task 3: Reader utilities
- Retain TOC and settings sheets, improve their reader-facing labels, and add lightweight reading statistics.

### Task 4: Verification
- Add regression coverage for UX boundaries and run architecture, typecheck, tests, and builds.
