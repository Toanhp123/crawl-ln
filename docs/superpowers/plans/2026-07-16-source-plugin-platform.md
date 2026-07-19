# Source Plugin Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dynamically loaded source plugins with manifest validation, restricted runtime context, health diagnostics, enable/disable/reload controls, crawler integration, and Settings UI.

**Architecture:** A standalone plugin module owns discovery, validation, runtime loading, state and diagnostics. Crawler consumes the module through the existing SourceAdapter abstraction. Plugins export a factory and receive only HTTP, HTML parsing, logging and clock capabilities.

**Tech Stack:** TypeScript, Node.js ESM, Express, React, TanStack Query, Zod.

## Global Constraints

- Plugin API version is `2`.
- Dynamic plugins live under `sources/<plugin-id>/manifest.json` and `index.js`.
- Plugin source cannot contain static/dynamic imports, require, process, filesystem, child-process or eval access.
- Existing selector profile adapter remains as fallback.
- Plugin failures never crash the crawler process.

---

### Task 1: Plugin contracts and manager
- [x] Define manifest, status, health and runtime contracts.
- [x] Implement discovery, validation, enable/disable, reload and watcher lifecycle.
- [x] Persist enabled state in storage.

### Task 2: Crawler integration
- [x] Adapt loaded plugins to SourceAdapter.
- [x] Register plugin adapter before selector fallback.
- [x] Start and stop plugin manager with application lifecycle.

### Task 3: API and UI
- [x] Add list, reload and enable/disable endpoints.
- [x] Add Settings plugin management panel and translations.

### Task 4: Verification
- [x] Add regression and integration coverage.
- [x] Run architecture, type, regression, integration and build gates.
