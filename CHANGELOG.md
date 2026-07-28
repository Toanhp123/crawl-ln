# Changelog

## Unreleased

- No unreleased changes yet.

## 1.0.0 - 2026-07-29

### Installation and Runtime

- Added one-command setup for dependencies, local API configuration, toolchain validation, and production build.
- Added a unified `npm start` production runtime serving the API and web application from one process.
- Kept `npm run dev` as the contributor workflow and added `--skip-build` for dependency-only setup.

### Library, Crawl, and Reader

- Added source analysis, crawl task lifecycle, library management, search, export, scheduler, and backup workflows.
- Added a continuous chapter reader with stable scrolling, chapter preloading, reading preferences, and position persistence.
- Added task cancellation and cleanup when novels are removed.

### Source Plugins

- Added the external Source Plugin SDK, isolated plugin runtime, version-scoped permissions, integrity verification, and quarantine policy.
- Added Plugin Studio for creating, importing, validating, building, testing, and installing source projects.
- Added the first-party NovelCool `1.0.0` package as an explicit install, approve, and enable workflow.

### Security and Operations

- Added loopback-safe defaults, explicit CORS, token-protected LAN access, encrypted secret storage, and redacted public errors.
- Added atomic production builds, database migrations, backup and restore controls, realtime updates, and regression coverage.
