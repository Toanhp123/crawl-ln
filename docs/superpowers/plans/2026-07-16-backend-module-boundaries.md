# Backend Module Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split backend composition into focused module factories and enforce clean module dependency boundaries.

**Architecture:** Build modules in dependency order from a shared infrastructure module. Cross-module application behavior is exposed through local ports, while shared domain identity utilities live under `shared/domain`.

**Tech Stack:** TypeScript, Express, Node SQLite, Node test runner.

## Global Constraints

- Preserve all existing HTTP and shared contracts.
- Do not change database schema or crawler/scheduler runtime behavior.
- Keep lifecycle ownership in the application container.

### Task 1: Add modularity regression tests
- [x] Assert the application container only composes module factories.
- [x] Assert novels application does not import crawler concrete application code.
- [x] Assert canonical chapter URL identity lives in shared domain.
- [x] Assert scheduler infrastructure does not import novels infrastructure.

### Task 2: Introduce shared kernel and local ports
- [x] Move chapter URL deduplication to `shared/domain/url`.
- [x] Add `SourceAnalyzerPort` and `CrawlJobCreatorPort` to novels application.
- [x] Add a scheduler-owned updater result contract.

### Task 3: Split composition root
- [x] Create infrastructure, tasks, chapters, crawler, novels, and scheduler factories.
- [x] Reduce `app-container.ts` to dependency ordering, lifecycle, and controller assembly.

### Task 4: Strengthen architecture enforcement
- [x] Resolve relative imports and detect dependency cycles.
- [x] Reject cross-module application and infrastructure dependencies.
- [x] Reject direct system clock reads in core layers.

### Task 5: Verify and package
- [x] Run type-check, regression, integration, and production build gates.
- [x] Update release metadata and package a clean source archive.
