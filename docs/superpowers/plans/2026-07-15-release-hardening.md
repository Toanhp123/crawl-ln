# Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the remaining development workflow, security, CI, integration-test, and E2E readiness gaps before the next tool upgrade.

**Architecture:** Keep application behavior unchanged. Harden the repository around reproducible runtime metadata, deterministic concurrent development startup, layered test gates, and CI automation.

**Tech Stack:** Node.js 22, npm workspaces, TypeScript, Vite 8, Node test runner, SQLite, Playwright, GitHub Actions.

- [x] Replace shell backgrounding with `concurrently`.
- [x] Lock Node/npm metadata.
- [x] Upgrade Vite/plugin-react and clear npm audit.
- [x] Add API integration smoke tests with temporary storage.
- [x] Add Playwright mobile navigation smoke coverage.
- [x] Add CI and a unified `verify` script.
- [x] Re-run checks, tests, builds, audit, and package a clean source archive.
