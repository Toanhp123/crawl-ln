# Reader Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local reading history, paragraph bookmarks, Continue Reading, and read chapter indicators.

**Architecture:** Extend the existing paragraph-anchor persistence with a focused continuity store. Keep UI reads isolated behind storage helpers and a lightweight change subscription hook.

**Tech Stack:** React, TypeScript, localStorage, React Router, Tailwind CSS.

## Global Constraints
- Preserve existing API contracts.
- Use paragraph anchors rather than pixel positions.
- Keep Reader in ReaderShell and overview in AppShell.

---

- [x] Add history, bookmark, read-chapter storage and change notifications.
- [x] Record activity whenever the reader saves a paragraph anchor.
- [x] Add bookmark controls to the immersive Reader toolbar.
- [x] Add Continue Reading, bookmark list, and read chapter markers to Novel Detail.
- [x] Add Recently Read and direct Continue actions to Library.
- [x] Add English and Vietnamese copy and regression coverage.
- [x] Run the complete repository verification command.
