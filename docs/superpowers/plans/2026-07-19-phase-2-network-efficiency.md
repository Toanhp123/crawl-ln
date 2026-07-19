# Phase 2 Network Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove avoidable request fan-out and background polling while preserving live task progress.

**Architecture:** Novel list responses are already summary-complete, so the web must consume them directly. Task badge gets a dedicated summary endpoint and query. Task detail keeps one fast task poll, slows event polling, and treats novel metadata as non-live. Settings plugins update by invalidation/manual refresh rather than polling.

**Tech Stack:** TypeScript, Express, SQLite, React Query, React.

## Global Constraints
- Preserve existing FSD boundaries.
- Add no new runtime dependency.
- Keep active-task progress live.
- Write regression tests before production changes.

---

### Task 1: Add failing phase-2 request-policy tests
- Test that Library no longer uses `useQueries` detail fallbacks.
- Test that bottom tabs use a task summary hook.
- Test that Task Detail does not poll novel detail and slows event polling.
- Test that source plugins do not poll.

### Task 2: Remove Library N+1 detail queries
- Consume summary fields returned by `/api/novels` directly.

### Task 3: Add Task summary API and hook
- Add repository active count, use case, controller route `/api/tasks/summary`, shared type, web API/hook/query key.
- Invalidate task summary alongside task-list mutations.

### Task 4: Reduce Task Detail polling
- Keep task polling at 2 seconds while active.
- Poll events at 3 seconds while active.
- Fetch novel metadata once with a long stale time.

### Task 5: Stop plugin polling and verify
- Remove plugin `refetchInterval`.
- Run regression, architecture, formatting, and available type checks.
