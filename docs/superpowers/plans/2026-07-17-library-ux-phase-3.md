# Library UX Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Library into a responsive card-first discovery and continue-reading experience with actionable search, filters, progress, and distinct empty/error states.

**Architecture:** Extend the Novel list read model with chapter counts, then keep reading-state filters and progress in frontend-owned continuity state. Compose the page from an entity card, library grid widget, continue-reading widget, and filter feature without changing crawl or reader behavior.

**Tech Stack:** React, TypeScript, TanStack Query, React Router, Tailwind CSS, Express, SQLite, Zod.

## Global Constraints

- Preserve existing API envelope, database schema, reader continuity keys, and crawl behavior.
- Keep FSD dependency direction and module public boundaries valid.
- Use chapter IDs for continuity; chapter index remains navigation metadata only.
- Support Vietnamese and English copy.

---

### Task 1: Add list read-model chapter counts
- [ ] Add failing contract/regression coverage for chapter count fields and operational filters/sorts.
- [ ] Extend shared Novel transport fields with optional chapter counts.
- [ ] Extend list query status/sort enums and SQLite list projection.
- [ ] Run API/shared type checks and focused tests.

### Task 2: Build card-first Library composition
- [ ] Add failing UX regression coverage for card CTA, progress, chips, and distinct empty states.
- [ ] Create `NovelLibraryCard` and `LibraryGrid`.
- [ ] Enrich `useLibraryPage` with continuity-aware filters, sorts, pagination, reset actions, and import navigation.
- [ ] Update `LibraryPage` and control sheet.

### Task 3: Polish states and verify
- [ ] Add English/Vietnamese translations.
- [ ] Format and run architecture/contract checks.
- [ ] Run TypeScript, regression, integration, and production builds.
- [ ] Package a clean source archive without generated dependencies or build output.
