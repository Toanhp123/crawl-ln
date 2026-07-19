# Application Event Boundary Implementation Plan

**Goal:** Decouple non-critical crawler audit and scheduler diagnostic persistence from core orchestration while preserving synchronous state transactions.

**Architecture:** Use a small in-process application event bus as shared technical infrastructure. Event payloads remain owned by their originating modules, and module-local publishers and handlers isolate persistence side effects from core use cases. Novel, chapter, task, and scheduler policy state remain synchronous.

## Changes

- Add a generic application-event contract and in-memory bus.
- Publish crawler audit records through `CrawlAuditPublisherPort`.
- Persist crawl audit events in a crawler-owned subscriber.
- Publish scheduler diagnostics through `NovelUpdateDiagnosticPublisherPort`.
- Persist and prune diagnostics in a scheduler-owned subscriber.
- Add architecture and regression guards preventing direct side-effect repository coupling from returning.
- Verify formatting, TypeScript, regression, integration, and production builds.
