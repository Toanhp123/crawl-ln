# Backend Domain Contract Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove backend domain-layer dependencies on `@novel-tool/shared` while preserving existing API contracts and runtime behavior.

**Architecture:** Each bounded module owns the types used by its domain. Application, infrastructure, and presentation layers may adapt structurally compatible domain values to transport contracts at outer boundaries. The API architecture guard prevents transport contracts from leaking back into domain code.

**Tech Stack:** TypeScript, Node.js, Express, SQLite, Zod, npm workspaces.

## Global Constraints

- Preserve all HTTP endpoints and response shapes.
- Do not introduce direct imports between bounded contexts.
- Do not change database schemas or migrations.
- Keep `@novel-tool/shared` available to application and presentation code until later phases.

---

### Task 1: Add the domain transport-boundary guard

**Files:**
- Modify: `scripts/check-api-architecture.mjs`

- [x] Reject `@novel-tool/shared` imports from any file under a backend `domain/` directory.
- [x] Run the guard and confirm it reports the existing six violations.

### Task 2: Introduce module-owned Novel and Chapter domain models

**Files:**
- Create: `apps/api/src/modules/novels/domain/models/novel.ts`
- Create: `apps/api/src/modules/chapters/domain/models/chapter.ts`
- Modify: `apps/api/src/modules/novels/domain/entities/novel.entity.ts`
- Modify: `apps/api/src/modules/novels/domain/repositories/novel.repository.ts`
- Modify: `apps/api/src/modules/chapters/domain/repositories/chapter.repository.ts`

- [x] Define module-owned status, primitive, and pagination types.
- [x] Update entities and repository contracts to consume those types.

### Task 3: Decouple remaining domain contracts

**Files:**
- Modify: `apps/api/src/modules/crawler/domain/events/crawl-event.entity.ts`
- Modify: `apps/api/src/modules/export/domain/export.ts`
- Modify: `apps/api/src/modules/plugin/domain/source-plugin.ts`

- [x] Define crawler event types inside crawler domain.
- [x] Define export projections inside export domain.
- [x] Define plugin analysis and chapter-content contracts inside plugin domain.

### Task 4: Verify behavior and package the source

- [x] Run architecture, formatting, TypeScript, regression, integration, and production-build checks.
- [x] Package the source without `node_modules` or build output.
