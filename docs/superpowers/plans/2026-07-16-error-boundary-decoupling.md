# Error Boundary Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove shared business/HTTP error classes from backend core layers while preserving the existing API error contract.

**Architecture:** Each bounded module owns its domain and application failures. The app HTTP boundary recognizes a small structural failure category and maps it to the shared transport error code and HTTP status.

**Tech Stack:** TypeScript, Express, Zod, Node test runner.

## Global Constraints

- Keep all endpoint response shapes and transport error codes unchanged.
- Domain and application code must not import `shared/errors` or HTTP adapters.
- Shared infrastructure must not own bounded-context failure classes.

---

### Task 1: Add architecture regression

- [x] Add `tests/regression/error-boundary.test.ts` requiring removal of shared error classes and app-boundary mapping.
- [x] Extend `scripts/check-api-architecture.mjs` to reject `shared/errors` ownership and core imports.
- [x] Confirm the regression fails before implementation.

### Task 2: Introduce module-owned failures

- [x] Add module-owned errors for backup, chapters, crawler, export, novels, scheduler, and task.
- [x] Add a novels domain validation error for value objects.
- [x] Replace every shared error import with the owning module error.

### Task 3: Move transport mapping to app HTTP boundary

- [x] Create `apps/api/src/app/http/error-middleware.ts`.
- [x] Map failure categories to the existing HTTP status and `ApiErrorCode` values.
- [x] Remove `apps/api/src/shared/errors` and the old shared middleware.
- [x] Update `app.ts` and regression fixtures.

### Task 4: Verify

- [x] Run architecture checks and TypeScript checks.
- [x] Run regression and integration suites.
- [x] Run production builds and package a clean archive.
