# SSE Realtime Synchronization Design

## Goal

Keep Library, task progress, novel details, scheduler state, plugin state, and backup restore results synchronized without manual refresh or aggressive polling.

## Architecture

REST remains the authoritative data source. The API exposes `GET /api/events` as a Server-Sent Events stream. A small in-memory realtime broker assigns monotonic event IDs, keeps a bounded replay buffer, sends heartbeat comments, and replays events newer than `Last-Event-ID` after reconnect.

Existing crawler audit and scheduler diagnostic application events are bridged into public realtime invalidation events. Successful manual mutations in the novels, crawler controls, scheduler, backup restore, and plugin controllers publish the same public events. Public events carry affected resource groups and optional task/novel/chapter identifiers; they do not duplicate authoritative entity payloads.

The web app opens one `EventSource` inside the query provider. Incoming events are batched for 150 ms, then invalidate only the relevant React Query keys. Reconnect and tab-resume trigger one active-query reconciliation. Existing fast polling is disabled while SSE is connected and becomes a 10–15 second fallback when disconnected.

## Public Event Contract

Each event has:

- `id`: monotonic process-local string ID used by SSE replay.
- `type`: `data.changed`.
- `resources`: one or more of `novels`, `tasks`, `scheduler`, `plugins`, `search`, or `all`.
- `reason`: stable machine-readable reason.
- `occurredAt`: ISO timestamp.
- Optional `taskId`, `novelId`, and `chapterIndex`.

## Backend Components

- `InMemoryRealtimeEventBroker`: publish, subscribe, replay, bounded history.
- `RealtimeController` and route: SSE headers, initial retry directive, heartbeat, cleanup.
- Application-event bridges for crawler audit and scheduler diagnostics.
- Mutation publishers in controllers for changes not represented by current application events.

## Frontend Components

- `RealtimeProvider`: owns EventSource lifecycle and exposes `connected | connecting | disconnected`.
- `realtimeInvalidation`: validates events, batches invalidations, maps resources and identifiers to query keys.
- `useRealtimeStatus`: lets existing query hooks switch between no polling and fallback polling.

## Failure Handling

- EventSource reconnect is automatic.
- Server replay covers recent disconnects; reconnect also invalidates active queries to recover from process restarts or buffer gaps.
- Polling remains available only while disconnected.
- Malformed events are ignored and logged without breaking the stream.
- REST mutations retain their current local cache invalidation, so realtime is additive rather than required for correctness.

## Verification

- Broker unit tests cover ordering, replay, and unsubscribe.
- API integration test covers SSE headers, event delivery, and cleanup behavior.
- Regression tests cover frontend event-to-query mapping and disabled/fallback polling contracts.
- Full `npm run verify` must pass.
