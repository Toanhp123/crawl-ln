# Application Contract Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove direct `@novel-tool/shared` transport-contract dependencies from every backend application layer while preserving API and database behavior.

**Architecture:** Each bounded module owns the DTOs used by its application services and consumer-owned ports. Infrastructure implements those contracts structurally, while presentation remains responsible for transport mapping and validation.

**Tech Stack:** TypeScript, Node.js, Express, Zod, SQLite, npm workspaces.

## Global Constraints

- Do not change HTTP routes, response envelopes, database schema, or runtime behavior.
- Do not introduce direct imports between bounded contexts.
- Application and domain layers must not import `@novel-tool/shared`.
- Architecture checks, TypeScript checks, regression tests, integration tests, and production builds must pass.

---

### Task 1: Add an application transport-boundary guard

**Files:**
- Modify: `scripts/check-api-architecture.mjs`
- Create: `tests/regression/application-contract-decoupling.test.ts`

- [x] Add a guard that reports any application-layer import of `@novel-tool/shared`.
- [x] Add a regression test that scans every backend application file.
- [x] Verify the guard fails against the previous Phase 5 structure.

### Task 2: Introduce module-owned application contracts

**Files:**
- Create: `apps/api/src/modules/crawler/application/models/crawler-contracts.ts`
- Create: `apps/api/src/modules/novels/application/models/novel-application.ts`
- Create: `apps/api/src/modules/scheduler/application/models/scheduler-contracts.ts`
- Modify: application files in `chapters`, `crawler`, `novels`, `plugin`, `scheduler`, and `task`

- [x] Define consumer-owned structural contracts for cross-module ports.
- [x] Reuse same-module domain models where dependency direction permits it.
- [x] Remove all application imports of `@novel-tool/shared`.

### Task 3: Align infrastructure implementations

**Files:**
- Modify: `apps/api/src/modules/scheduler/infrastructure/scheduler-sqlite.repository.ts`

- [x] Implement the scheduler application diagnostic contract directly.
- [x] Keep SQL rows and API transport output unchanged.

### Task 4: Verify behavior and packaging

- [x] Run architecture and TypeScript checks.
- [x] Run regression and integration suites.
- [x] Run shared, API, and web production builds.
- [x] Package the source without `node_modules` or build output.
