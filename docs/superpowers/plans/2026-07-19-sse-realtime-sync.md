# SSE Realtime Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add resilient SSE-driven cache synchronization while retaining REST authority and disconnected polling fallback.

**Architecture:** A bounded in-memory broker serves `/api/events`; module events and successful mutations publish invalidation hints. A React provider batches hints into targeted React Query invalidations and exposes connection state to polling hooks.

**Tech Stack:** TypeScript, Express, Server-Sent Events, React, TanStack Query, Node test runner.

## Global Constraints

- Do not add a WebSocket dependency.
- REST remains authoritative.
- Do not send full novel, chapter, or task payloads over SSE.
- Preserve manual refresh controls.
- Disable fast polling only while SSE is connected.
- Use 10–15 second polling fallback when disconnected.

---

### Task 1: Shared realtime contract and broker

**Files:**
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/shared/realtime/realtime-event-broker.ts`
- Test: `tests/regression/realtime-event-broker.test.ts`

**Interfaces:**
- Produces: `RealtimeEvent`, `RealtimeResource`, `RealtimeEventInput`, `InMemoryRealtimeEventBroker`.

- [ ] Write a failing test proving monotonic IDs, bounded replay, and unsubscribe.
- [ ] Run the test and confirm it fails because the broker is missing.
- [ ] Implement the shared contract and broker.
- [ ] Run the focused test and confirm it passes.

### Task 2: SSE endpoint and backend publishers

**Files:**
- Create: `apps/api/src/shared/realtime/realtime.controller.ts`
- Create: `apps/api/src/shared/realtime/realtime.routes.ts`
- Modify: `apps/api/src/shared/container/modules/infrastructure.module.ts`
- Modify: `apps/api/src/shared/container/app-container.ts`
- Modify: `apps/api/src/app.ts`
- Modify mutation controllers and their container wiring in novels, crawler, scheduler, backup, and plugin modules.
- Test: `tests/integration/realtime-events.test.ts`

**Interfaces:**
- Consumes: broker from Task 1.
- Produces: `GET /api/events` and realtime publication from background/application mutations.

- [ ] Write a failing integration test for SSE headers and event delivery after a successful mutation.
- [ ] Run it and confirm the endpoint is missing.
- [ ] Implement the SSE route, heartbeat cleanup, application-event bridges, and mutation publishers.
- [ ] Run the focused integration test and confirm it passes.

### Task 3: Frontend EventSource and cache invalidation

**Files:**
- Create: `apps/web/src/shared/realtime/realtimeInvalidation.ts`
- Create: `apps/web/src/shared/realtime/RealtimeProvider.tsx`
- Create: `apps/web/src/shared/realtime/index.ts`
- Modify: `apps/web/src/app/providers/QueryProvider.tsx`
- Test: `tests/regression/web-realtime-sync.test.ts`

**Interfaces:**
- Consumes: shared `RealtimeEvent`.
- Produces: provider status and batched targeted invalidation.

- [ ] Write failing regression tests for provider wiring, 150 ms batching, reconnect reconciliation, and resource-to-query mapping.
- [ ] Run them and confirm failure.
- [ ] Implement EventSource lifecycle and invalidation batching.
- [ ] Run focused tests and confirm pass.

### Task 4: Polling fallback conversion

**Files:**
- Modify task, crawl, novel detail, scheduler settings, and diagnostics query hooks.
- Test: `tests/regression/web-realtime-sync.test.ts`

**Interfaces:**
- Consumes: `useRealtimeStatus`.
- Produces: no polling when connected; 10–15 second polling fallback when disconnected.

- [ ] Extend tests to fail on old 1.2–3 second polling.
- [ ] Update hooks to use connection-aware fallback intervals.
- [ ] Run regression, type-check, integration, and production build.

### Task 5: Final verification and artifact

- [ ] Run `npm run verify`.
- [ ] Remove `node_modules`, `dist`, coverage, SQLite temporary files, and test artifacts from the deliverable.
- [ ] Create a ZIP containing the source tree and report exact verification counts.
