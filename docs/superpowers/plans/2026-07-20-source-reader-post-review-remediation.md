# Source Reader Post-Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Source Reader runtime, contract, pagination, browser, and documentation gaps found by independent final review.

**Architecture:** Keep request policy in `SourceReaderService`, execution deadline enforcement in the runtime boundary, and IPC validation in the external-process protocol boundary. Use capability-specific DTO allowlists, fail-closed bounded protocol parsing, progress-aware pagination, and anonymous browser identities for public browser-only sources.

**Tech Stack:** TypeScript, Node.js 22 child processes, Zod, Node test runner, Express DTO validation, Playwright-backed browser worker.

## Global Constraints

- External plugin frames must be bounded by depth, node count, and approximate byte size before recursive schema parsing.
- Public `timeoutMs` must be accepted by HTTP, propagated to the runtime, and enforced for in-process and isolated plugins.
- Plugins receive only capability contract fields; actor and runtime metadata stay in the host.
- Pagination must fail closed on missing cursor, repeated cursor, or no-progress pages.
- `runtime.requiresBrowser` must work independently from authentication, while secret filling remains unavailable without credentials.
- Package and network documentation must match the implementation.

---

### Task 1: Bound external RPC before schema recursion

**Files:**
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.schema.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts`
- Test: `tests/regression/source-reader-external-process-sandbox.test.ts`

- [x] Add a deeply nested external plugin fixture in the test and assert `PLUGIN_RPC_PROTOCOL_INVALID`, sandbox termination, and no host `uncaughtException`.
- [x] Run the test and verify it fails with the current recursive Zod parser.
- [x] Add iterative frame bounds and exception-safe parse helpers for both protocol directions.
- [x] Route request send, startup hello parsing, and runtime message parsing through the helpers.
- [x] Re-run the focused sandbox tests.

### Task 2: Enforce request-specific deadlines

**Files:**
- Modify: `apps/api/src/modules/source-reader/presentation/dto/source-reader.dto.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/plugin-runtime.port.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/runtime-router.ts`
- Test: `tests/regression/source-reader-service.test.ts`
- Test: `tests/regression/source-reader-in-process-runtime.test.ts`
- Test: `tests/regression/source-reader-http-contract.test.ts`

- [x] Add tests showing HTTP accepts `timeoutMs`, isolated runtime receives the requested deadline, and a hanging in-process plugin rejects with `SOURCE_REQUEST_TIMEOUT`.
- [x] Run tests and verify the missing behavior.
- [x] Normalize timeout to 1–120000 ms, compose caller cancellation with a deadline signal, and pass `timeoutMs` through `PluginInvocation`.
- [x] Race in-process execution against cancellation/deadline and use the invocation deadline for external RPC.
- [x] Re-run focused tests.

### Task 3: Enforce plugin DTO least privilege and pagination progress

**Files:**
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Test: `tests/regression/source-reader-service.test.ts`

- [x] Add tests asserting capability-specific request keys only.
- [x] Add tests asserting missing/repeated plugin cursor and empty no-progress pages reject with `PLUGIN_RESULT_INVALID`.
- [x] Run tests and verify failures.
- [x] Replace request spreading with explicit capability DTO construction.
- [x] Validate page progress before signing a host cursor and track repeated host cursors during streaming.
- [x] Re-run service and crawler-focused tests.

### Task 4: Support public browser-required sources

**Files:**
- Modify: `apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Test: `tests/regression/source-reader-runtime-context.test.ts`
- Test: `tests/integration/source-reader-authenticated-read.test.ts`

- [x] Add tests for `requiresBrowser: true` without authentication or credentials.
- [x] Run tests and verify the current auth-only gate fails.
- [x] Resolve browser requirement directly from the manifest and create a stable anonymous source identity when no credential exists.
- [x] Keep credential/session fields only for authenticated sessions.
- [x] Re-run runtime-context and browser-read tests.

### Task 5: Synchronize operational documentation and checkpoint status

**Files:**
- Modify: `docs/SOURCE_READER.md`
- Modify: `docs/MILESTONES_STATUS.md`
- Modify: `CHECKPOINT-PROGRESS.md`
- Modify: `docs/superpowers/plans/2026-07-20-source-reader-final-review-remediation.md`
- Create: `docs/superpowers/checkpoints/2026-07-20-source-reader-post-review-remediation.md`

- [x] Correct package layout to `manifest.json`, `dist/index.js`, and `checksums.json`.
- [x] Remove unsupported VPN claims and mark legacy VPN rows as fail-closed migration data.
- [x] Replace stale pre-Source-Reader milestone statements.
- [x] Mark the old checkpoint as superseded and correct the final-review plan module path.
- [x] Record exact fresh verification results in the new checkpoint.

### Task 6: Full verification and artifact packaging

- [x] Run focused red/green tests after each task.
- [x] Run all Source Reader regression and integration tests.
- [x] Run `npm run check` and `npm run build`.
- [x] Inspect `git diff --check` and repository status.
- [x] Commit remediation changes and create a ZIP excluding `node_modules` and build outputs.
