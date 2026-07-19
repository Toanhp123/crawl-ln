# Settings UX Phase 4 Implementation Plan

**Goal:** Turn Settings into a task-oriented hub for data safety, export guidance, plugin health, scheduler health, and preferences without inventing unsupported backend capabilities.

**Architecture:** Keep page orchestration in `pages/settings`, operational actions in existing features, and system summary in a widget. Reuse current APIs and transport contracts; do not change database schema.

**Tech Stack:** React, TypeScript, TanStack Query, Tailwind, existing shared UI primitives.

## Scope

- Task-oriented settings dashboard cards.
- System health summary from scheduler and plugin queries.
- Staged backup/restore experience with file validation and explicit confirmation.
- Human-readable plugin status and detail sheet.
- Export guidance in Settings and improved per-novel export completion feedback.
- Vietnamese and English copy.
- Regression coverage and full repository verification.
