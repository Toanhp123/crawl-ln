# Backend Module Boundaries Design

## Goal

Make backend composition and module ownership explicit without changing HTTP contracts or runtime behavior.

## Design

The application container becomes a small composition root that creates focused infrastructure, task, chapter, crawler, novel, and scheduler modules in dependency order. Each module factory owns construction of its repositories, services, use cases, and controller-facing dependencies.

Cross-module application calls use local ports. The novels module depends on source analysis and crawl-job creation contracts rather than crawler concrete classes. Shared chapter URL identity moves to a shared domain utility. Infrastructure adapters do not reuse another module's infrastructure mapper.

The architecture checker resolves relative imports, rejects cross-module application-to-application and infrastructure-to-infrastructure dependencies, detects dependency cycles, and rejects direct system clock reads in core layers.

## Compatibility

Routes, request/response contracts, SQLite schema, background lifecycle, crawl behavior, and scheduler behavior remain unchanged.

## Verification

Type-check all workspaces, run architecture checks, regression tests, integration tests, and production builds.
