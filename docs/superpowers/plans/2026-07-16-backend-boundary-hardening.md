# Backend Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the backend modular-monolith boundaries without changing API behavior or database schema.

**Architecture:** Keep the existing Clean Architecture layers, but move repository construction into the owning module factories, expose explicit public/internal module APIs, remove presentation dependence on the global container, and replace concrete cross-module aliases with local ports/wrappers. The composition root only orders and connects modules.

**Tech Stack:** TypeScript, Express, SQLite, Node test runner, existing architecture scripts.

## Global Constraints

- Preserve all HTTP routes and response contracts.
- Preserve SQLite schema and migrations.
- Do not change crawl, scheduler, task, or outcome behavior.
- No new runtime dependency.

---

### Task 1: Module-owned persistence
- [ ] Make infrastructure module expose only database, clock, ids, logger, and config.
- [ ] Let tasks, chapters, crawler, novels, and scheduler construct their own SQLite repositories.
- [ ] Split novels persistence bootstrap from novels application wiring to avoid a factory cycle.
- [ ] Run API type-check.

### Task 2: Explicit module APIs
- [ ] Expose `api`, `presentation`, and `internal` sections from module factories.
- [ ] Replace direct `useCases` sharing with typed module API access.
- [ ] Replace the crawler concrete alias in novels with a local wrapper over `CrawlJobCreatorPort`.
- [ ] Replace NovelController's concrete task use-case type with a novels-owned query port.
- [ ] Run API type-check and regression tests.

### Task 3: Presentation isolation
- [ ] Make route factories accept only their controllers/handlers.
- [ ] Update app bootstrap to pass the minimal route dependencies.
- [ ] Add architecture regression checks preventing route imports of `AppContainer`.
- [ ] Run API type-check and route integration tests.

### Task 4: Architecture enforcement and release verification
- [ ] Extend architecture checker for module-factory repository ownership and presentation isolation.
- [ ] Update architecture documentation and changelog.
- [ ] Run full verify and production builds.
- [ ] Package a clean release archive without dependencies or build artifacts.
