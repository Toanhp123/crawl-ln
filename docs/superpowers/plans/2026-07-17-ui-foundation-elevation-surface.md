# UI Foundation Elevation and Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give structural surfaces, content cards, dense panels and overlays one unambiguous elevation hierarchy.

**Architecture:** `Surface` remains a shadow-free structural primitive. `Card` becomes the only standard content container with canonical elevation variants, while the new `Panel` primitive handles compact nested groupings without elevation. Overlays and toasts consume fixed levels from the existing `--elevation-0..3` scale.

**Tech Stack:** React, TypeScript, class-variance-authority, Tailwind CSS, CSS custom properties, Node test runner.

## Global Constraints

- Preserve the existing elevation token scale and dark/light color system.
- Do not change typography, semantic state colors or density settings in this phase.
- Feature code imports primitives through `@/shared/ui`.
- Shared primitives must not introduce pixel radii or arbitrary box shadows.

---

### Task 1: Lock surface hierarchy with regression tests

- [x] Add regression assertions for shadow-free `Surface`, canonical `Card` elevation, non-elevated `Panel`, overlay levels and forbidden arbitrary shadows/radii.
- [x] Run the focused test and confirm it fails against Phase 2.

### Task 2: Normalize shared layout primitives

- [x] Remove the elevated tone from `Surface`.
- [x] Replace legacy Card elevation names with `flat`, `raised` and `floating`.
- [x] Add and export `Panel` for dense nested groups.
- [x] Replace arbitrary shadow and pixel-radius values in shared primitives.

### Task 3: Migrate semantic consumers

- [x] Move import, backup, plugin, maintenance and settings content containers from elevated Surface to Card.
- [x] Move compact metrics and status groups to Panel.
- [x] Use elevation 3 for modal overlays and elevation 2 for toasts.

### Task 4: Document and verify

- [x] Document Surface, Card, Panel and overlay ownership.
- [x] Run architecture checks, formatter, TypeScript, regression, integration and production builds.
- [x] Remove generated dependencies/build outputs and create a clean archive.
