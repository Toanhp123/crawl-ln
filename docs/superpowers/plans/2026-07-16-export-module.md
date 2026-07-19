# Export Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone export bounded module that produces EPUB3 and UTF-8 TXT for all downloaded chapters or a selected chapter range.

**Architecture:** The export module owns format/options, a pipeline, writer ports, filesystem-free in-memory writers, HTTP presentation, and a novels-backed source adapter. The novels module no longer owns export behavior; composition root wires the source adapter to novels persistence.

**Tech Stack:** TypeScript, Express, Zod, JSZip, React, Fetch API.

## Global Constraints

- Preserve the legacy novel export endpoint during 2.5.0.
- Export only fetched chapters when `downloadedOnly` is true.
- EPUB output must be EPUB3-compatible and place uncompressed `mimetype` first.
- TXT output must include UTF-8 BOM.
- No database schema changes.

---

### Task 1: Shared contracts and export domain
- [ ] Add format/options schemas and binary export result contract.
- [ ] Add range validation and filename normalization tests.

### Task 2: Export pipeline and writers
- [ ] Add source/writer ports and pipeline filtering/sorting.
- [ ] Add TXT writer and EPUB3 JSZip writer.
- [ ] Test downloaded-only, range, empty selection, BOM, EPUB entries.

### Task 3: Module wiring and HTTP API
- [ ] Add novels source adapter, controller, route, module factory.
- [ ] Add `POST /api/exports/novels/:id` and legacy GET delegation.
- [ ] Test attachment headers and validation.

### Task 4: Web export UI
- [ ] Add EPUB/TXT, range inputs, downloaded-only option, Blob download.
- [ ] Add Vietnamese/English copy.

### Task 5: Verification and release
- [ ] Update README, CHANGELOG and versions to 2.5.0.
- [ ] Run architecture, type, regression, integration and build gates.
