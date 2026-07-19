# Shared Kernel Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep backend shared code limited to technical primitives and move URL business policies into explicit bounded-context ownership.

**Architecture:** `SourceUrl` belongs to the novels domain. Chapter URL identity is a local policy in crawler and novels because each module consumes it for a different use case; the small implementation is duplicated intentionally to avoid hidden cross-module ownership.

**Tech Stack:** TypeScript, Node.js test runner, npm workspaces.

## Global Constraints

- Preserve endpoint, database, and transport behavior.
- Do not introduce direct bounded-context imports.
- Keep domain and application layers independent from `@novel-tool/shared`.
- Add an architecture guard preventing business code under `apps/api/src/shared/domain`.

---

### Task 1: Move source URL ownership to novels

- [x] Add `modules/novels/domain/value-objects/source-url.vo.ts`.
- [x] Update Novel entity and analyze use case imports.
- [x] Remove the shared source URL implementation.

### Task 2: Localize chapter URL identity policies

- [x] Add module-owned URL key policy to crawler.
- [x] Add module-owned URL key policy to novels.
- [x] Update crawler engine and novel use cases.

### Task 3: Protect the shared kernel boundary

- [x] Add API architecture rejection for `shared/domain`.
- [x] Add regression coverage.
- [x] Run architecture, type, regression, integration, and build verification.
