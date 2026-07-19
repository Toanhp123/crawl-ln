# Reader Engine 2.8.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bounded Reader Engine with cached chapter loading, forward infinite reading, on-demand previous chapter loading, bounded memory, and persisted reading position/history.

**Architecture:** Add a frontend `modules/reader` bounded module with pure domain window logic, application orchestration, IndexedDB-backed chapter cache, and a React presentation hook. The existing chapter-reader page becomes a thin UI over this module while existing API contracts remain unchanged.

**Tech Stack:** React 18, TypeScript, TanStack Query-compatible fetch functions, IndexedDB, localStorage, Node test runner.

## Global Constraints

- Keep existing reader routes and API contracts compatible.
- Only fetched chapters may be appended to the reading stream.
- Automatically append the next chapter near the bottom; load the previous chapter only near the top.
- Keep at most five chapter payloads in the mounted reader window.
- Persist and restore the active chapter position.
- Do not add third-party runtime dependencies.

---

### Task 1: Reader domain window

**Files:**
- Create: `apps/web/src/modules/reader/domain/reader-window.ts`
- Test: `tests/regression/reader-engine.test.ts`

- [ ] Write failing tests for append, prepend, deduplication, and bounded eviction.
- [ ] Run the reader-engine test and verify failure.
- [ ] Implement immutable reader-window operations.
- [ ] Run the reader-engine test and verify pass.

### Task 2: Reader cache and source

**Files:**
- Create: `apps/web/src/modules/reader/application/reader-chapter-source.ts`
- Create: `apps/web/src/modules/reader/infrastructure/indexeddb-reader-cache.ts`
- Modify: `tests/regression/reader-engine.test.ts`

- [ ] Add failing tests for cache-first loading and memory-cache LRU behavior.
- [ ] Implement bounded memory cache and cache-first source.
- [ ] Verify tests pass.

### Task 3: Infinite reader hook

**Files:**
- Create: `apps/web/src/modules/reader/presentation/use-infinite-reader.ts`
- Create: `apps/web/src/modules/reader/index.ts`
- Modify: `apps/web/src/pages/chapter-reader/model/useChapterReaderPage.ts`

- [ ] Add source regression assertions for reader module ownership and sentinel loading behavior.
- [ ] Implement the hook with initial load, adjacent preload, append, prepend, active chapter tracking, and URL synchronization callbacks.
- [ ] Verify TypeScript and regression tests.

### Task 4: Reader page integration

**Files:**
- Modify: `apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx`
- Modify: `apps/web/src/entities/chapter/ui/ChapterReader.tsx`
- Modify: `apps/web/src/shared/i18n/locales/en.ts`
- Modify: `apps/web/src/shared/i18n/locales/vi.ts`

- [ ] Render a bounded multi-chapter stream with top/bottom sentinels.
- [ ] Persist positions for the active chapter and restore the initial chapter anchor.
- [ ] Preserve toolbar, chapter list, swipe navigation, and reader preferences.
- [ ] Add accessible loading/end-of-book messages.
- [ ] Verify TypeScript and regression tests.

### Task 5: Release verification

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] Set version to 2.8.0 and document the Reader Engine.
- [ ] Run `npm run verify`.
- [ ] Remove dependencies and build artifacts from the deliverable.
- [ ] Create and validate the release ZIP.
