# Phase 2 Library and Novel Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Library and the novel overview for a polished mobile-first browsing and chapter-selection experience without changing API contracts.

**Architecture:** Keep FSD boundaries: page models own filtering and pagination, widgets compose entity UI, and shared primitives provide search, skeleton, pagination, cards, and feedback. The existing `/reader/:novelId` route remains the novel detail screen while `/reader/:novelId/:chapterIndex` remains immersive reading.

**Tech Stack:** React, TypeScript, Tailwind CSS, TanStack Query, React Router, existing shared UI primitives.

## Global Constraints

- Preserve all API and persistence behavior.
- Support widths 320–430px first and remain usable on wider screens.
- Use existing semantic design tokens and 180–220ms motion.
- Keep touch targets at least 44×44px.
- Do not add UI dependencies.

---

### Task 1: Library state and pagination
- [ ] Add page state, page-size slicing, counts, reset behavior, and refresh action to `useLibraryPage`.
- [ ] Add regression coverage for the new library UI contract.

### Task 2: Library presentation
- [ ] Replace the compact list with responsive novel cards showing source, status, update time, and chapter-oriented visual hierarchy.
- [ ] Add sticky search/filter controls, item count, loading skeletons, empty/error states, and pagination.

### Task 3: Novel detail presentation
- [ ] Redesign `/reader/:novelId` as a hero/detail view with cover, source, status, chapter statistics, progress, primary actions, and destructive action separation.
- [ ] Keep the immersive chapter reader unchanged.

### Task 4: Chapter discovery
- [ ] Add chapter search and robust pagination reset/clamping to `ChapterList`.
- [ ] Preserve status localization and error rendering.

### Task 5: Verification and packaging
- [ ] Run `npm run verify`.
- [ ] Inspect changed files for FSD/import consistency and mobile density.
- [ ] Package a new Phase 2 zip without overwriting Phase 1.
