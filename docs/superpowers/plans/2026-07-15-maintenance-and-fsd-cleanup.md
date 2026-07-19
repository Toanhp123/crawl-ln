# Maintenance and FSD Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the seven identified maintenance, dependency, documentation, formatting, and Settings FSD issues without changing user-facing behavior.

**Architecture:** Keep the existing monorepo and FSD boundaries. Move Settings state derivation and mutation helpers into a page model hook, split visual groups into focused UI components, and centralize displayed build metadata.

**Tech Stack:** TypeScript, React 18, Vite, npm workspaces, Zod, Node test runner with tsx.

## Global Constraints

- Release version is `2.0.1` in root, API, web, shared, and UI metadata.
- Preserve current routes, API behavior, and visual semantics.
- Run architecture guards, crawler guards, type checks, regression tests, and production builds.

---

### Task 1: Dependency and release metadata
- [ ] Add root `tsx` dev dependency and refresh lockfile.
- [ ] Synchronize workspace package versions to `2.0.1`.
- [ ] Add centralized web build metadata.
- [ ] Verify npm workspace metadata.

### Task 2: Frontend cleanup
- [ ] Remove `errors.ts.tmp`.
- [ ] Reformat `CrawlPage` into readable JSX.
- [ ] Extract library sorting/filtering into the page model and reformat `LibraryPage`.
- [ ] Type-check web.

### Task 3: Settings FSD refactor
- [ ] Create `useSettingsPage` for settings state, options, cycling, and toggles.
- [ ] Create reusable Settings UI primitives and section components.
- [ ] Reduce `SettingsPage` to composition only.
- [ ] Verify behavior through type-check and UI regression tests.

### Task 4: Documentation and verification
- [ ] Update README architecture, setup, routes, scripts, and documentation links.
- [ ] Add a `2.0.1` changelog entry.
- [ ] Run `npm run check`, `npm run test:regression`, and `npm run build`.
- [ ] Package the verified source as a new zip.
