# Scheduler Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the six identified scheduler, diagnostics, UI-copy, testing, and documentation fixes without unrelated refactoring.

**Architecture:** Preserve the existing scheduler service and repository boundaries. Add bounded parallel workers, route all scheduler time reads through `ClockPort`, enforce per-novel diagnostics retention in the repository, and upgrade regression coverage to executable behavior tests.

**Tech Stack:** TypeScript, Node test runner, Express, SQLite, React, Vite.

## Global Constraints

- Process at most 5 due novels per tick.
- Run at most 3 novel updates concurrently.
- Keep 100 diagnostics entries per novel.
- Only fix directly related errors.

---

### Task 1: Scheduler behavior
- [ ] Add failing behavior tests for batch size, concurrency, active-task skipping, backoff, and fake-clock timestamps.
- [ ] Replace sequential iteration with a bounded three-worker queue.
- [ ] Replace direct `Date.now()` scheduler reads with `ClockPort`.
- [ ] Run scheduler behavior tests.

### Task 2: Diagnostics retention
- [ ] Add a repository contract for pruning old entries.
- [ ] Prune to the newest 100 entries after each scheduler diagnostic write.
- [ ] Add and run a SQLite retention test.

### Task 3: Settings copy
- [ ] Rename the manual scheduler action to state that it checks all due novels.
- [ ] Add explanatory copy in English and Vietnamese.
- [ ] Run frontend type-check.

### Task 4: Documentation cleanup
- [ ] Update README version and scheduler/API documentation to 2.3.0.
- [ ] Remove duplicated Changelog heading and duplicated 2.1.3 section.

### Task 5: Verification and packaging
- [ ] Run regression tests, integration tests, type checks, and production build.
- [ ] Package the completed source as a new ZIP.
