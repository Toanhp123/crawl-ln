# Phase 4 Production Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve accessibility, route performance, motion consistency, and production verification without changing product behavior.

**Architecture:** Keep FSD page boundaries intact. Add route-level lazy loading in the app router, improve semantics inside shared primitives, and retain one reduced-motion policy in the theme layer.

**Tech Stack:** React 18, React Router, TypeScript, Tailwind CSS, Vite, Node test runner.

## Global Constraints
- Preserve all Phase 1–3 routes and redirects.
- Do not change crawler or reader persistence behavior.
- Add regression coverage before production changes.

### Task 1: Route code splitting
- [x] Add failing regression coverage.
- [x] Lazy-load page modules with a shared Suspense fallback.
- [x] Verify route behavior and production chunks.

### Task 2: Shared control accessibility
- [x] Give Progress native progressbar semantics.
- [x] Add roving tab index and arrow-key operation to SegmentedControl.
- [x] Give ReaderShell a focusable main landmark and matching skip link.

### Task 3: Motion policy cleanup
- [x] Remove duplicate reduced-motion declarations from app CSS.
- [x] Keep shared/theme/motion.css as the single source of truth.

### Task 4: Production verification
- [x] Run TypeScript and architecture checks.
- [x] Run all regression and integration tests.
- [x] Run production build and inspect route chunks.
- [x] Package a clean source archive without dependencies or build output.
