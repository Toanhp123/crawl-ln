# Novel Process Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove cross-aggregate transactions from `NovelRepository` and expose explicit application persistence ports for analyze and delete workflows.

**Architecture:** `NovelRepository` remains a novel-only repository. Analyze and delete workflows depend on consumer-owned application ports whose SQLite adapters coordinate the required multi-table transaction without leaking chapter/task persistence into the domain repository contract.

**Tech Stack:** TypeScript, Node.js SQLite, npm workspaces, node:test.

## Global Constraints

- Preserve all HTTP contracts and runtime behavior.
- Preserve atomic novel/chapter analysis persistence and cascading novel deletion.
- Do not introduce direct imports between bounded contexts.
- Add architecture guards preventing `NovelRepository` from regaining cross-table process methods.

---

### Task 1: Extract analyze transaction

**Files:**
- Create: `apps/api/src/modules/novels/application/ports/novel-analysis-persistence.port.ts`
- Create: `apps/api/src/modules/novels/infrastructure/sqlite/novel-analysis-sqlite.adapter.ts`
- Modify: `apps/api/src/modules/novels/application/use-cases/analyze-novel.usecase.ts`
- Modify: `apps/api/src/modules/novels/domain/repositories/novel.repository.ts`
- Modify: `apps/api/src/modules/novels/infrastructure/sqlite/novel-sqlite.repository.ts`

- [ ] Define `NovelAnalysisPersistencePort.persist(novel, chapters)`.
- [ ] Move the novel/chapter upsert transaction into its SQLite adapter.
- [ ] Inject the port into `AnalyzeNovelUseCase`.
- [ ] Remove `saveNovel` from `NovelRepository` and its SQLite implementation.

### Task 2: Extract delete transaction

**Files:**
- Create: `apps/api/src/modules/novels/application/ports/novel-deletion.port.ts`
- Create: `apps/api/src/modules/novels/infrastructure/sqlite/novel-deletion-sqlite.adapter.ts`
- Modify: `apps/api/src/modules/novels/application/use-cases/commands/delete-novel.usecase.ts`
- Modify: `apps/api/src/modules/novels/domain/repositories/novel.repository.ts`
- Modify: `apps/api/src/modules/novels/infrastructure/sqlite/novel-sqlite.repository.ts`

- [ ] Define `NovelDeletionPort.delete(id)`.
- [ ] Move the chapter/task/novel delete transaction into its SQLite adapter.
- [ ] Inject the port into `DeleteNovelUseCase`.
- [ ] Remove `deleteById` from `NovelRepository`.

### Task 3: Wire composition and protect boundaries

**Files:**
- Modify: `apps/api/src/shared/container/modules/novels-persistence.module.ts`
- Modify: `apps/api/src/shared/container/modules/novels.module.ts`
- Modify: `scripts/check-api-architecture.mjs`

- [ ] Construct both process adapters in the composition root.
- [ ] Pass the process ports to analyze and delete use cases.
- [ ] Fail architecture checks when `NovelRepository` declares process or chapter/task persistence methods.

### Task 4: Migrate tests and verify

**Files:**
- Modify: `tests/integration/sqlite-transaction.test.ts`
- Modify: `tests/integration/task-active-constraint.test.ts`
- Modify: `tests/regression/incremental-update-recovery.test.ts`
- Create: `tests/regression/novel-process-persistence-boundary.test.ts`

- [ ] Replace direct `saveNovel` test setup with `NovelAnalysisSqliteAdapter`.
- [ ] Remove obsolete process methods from in-memory repositories.
- [ ] Add a regression test for the repository boundary.
- [ ] Run architecture, type, regression, integration, and production build verification.
