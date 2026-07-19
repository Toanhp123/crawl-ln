# Presentation and Module Public API Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure backend application/domain objects cross HTTP and module boundaries only through explicit presentation mappers and module-owned public facades.

**Architecture:** Presentation mappers convert module-owned application/domain models to shared transport contracts. Composition factories constrain cross-module surfaces with public API interfaces owned by the providing module; concrete repositories and persistence adapters remain private to composition.

**Tech Stack:** TypeScript, Express, Zod, Node test runner, npm workspaces.

## Global Constraints

- Preserve all existing endpoint paths, status codes, response envelopes, and database schemas.
- Keep domain and application layers free from `@novel-tool/shared` imports.
- Do not expose repositories or persistence adapters through module public APIs.

---

### Task 1: Add failing architecture regression tests

- [x] Add a regression test requiring transport mappers in entity-facing controllers.
- [x] Add a regression test requiring module-owned public API facades.
- [x] Confirm the tests fail against the Phase 6 controller and inferred module surfaces.

### Task 2: Add presentation transport mappers

- [x] Add explicit Novel, Chapter, Task, crawl-event and crawl-task response mappers.
- [x] Update entity-facing controllers to map use-case results before calling HTTP response helpers.
- [x] Preserve the existing analyze-novel response shape used by the web client.

### Task 3: Add module public facades

- [x] Define public API and lifecycle contracts in each provider module.
- [x] Constrain composition-root API objects with TypeScript `satisfies` checks.
- [x] Remove the `novels.internal` persistence escape hatch.

### Task 4: Enforce and verify

- [x] Extend the API architecture guard for direct application-result responses and inferred cross-module surfaces.
- [x] Run formatting, architecture checks, TypeScript checks, regression tests, integration tests and production builds.
