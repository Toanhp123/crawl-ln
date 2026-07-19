# Search Engine Implementation Plan

**Goal:** Add SQLite FTS5 global search with ranking, filters, snippets, automatic indexing, rebuild, API, and responsive UI.

**Architecture:** The standalone search module owns its repository, use cases, controller, routes, and SQLite adapter. Migration 8 creates a derived FTS5 index maintained by triggers, so crawler updates and backup restore remain consistent without cross-module callbacks.

**Verification:** Architecture checks, 101 regression tests, 17 integration tests, and Shared/API/Web production builds pass.
