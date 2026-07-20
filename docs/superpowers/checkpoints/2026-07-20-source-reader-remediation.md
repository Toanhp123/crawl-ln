# Source Reader Security Remediation Checkpoint

**Date:** 2026-07-20
**Branch:** `feat/source-reader`
**Plan:** `docs/superpowers/plans/2026-07-20-source-reader-security-remediation.md`
**Progress:** **6/12 remediation tasks complete**

## Completed batch 1

1. **Task 1 — Replace worker-thread trust boundary with a supervised process sandbox**
   Commit: `2dfd75d feat(source-reader): sandbox external plugins in supervised processes`

2. **Task 2 — Route HTTP and Chromium traffic through resolved network profiles**
   Commit: `192c7f3 feat(source-reader): route HTTP and browser traffic through profiles`

3. **Task 3 — Separate cache scope identities and bind sessions to plugin version and route**
   Commit: `91695f6 fix(source-reader): isolate cache scopes and session bindings`

## Completed batch 2

4. **Task 4 — Add plugin lifecycle and atomic candidate activation**
   Commit: `e114a21 feat(source-reader): activate plugins through lifecycle gates`

5. **Task 5 — Enforce host, capability, extension, and package compatibility policy**
   Commit: `e253fbc feat(source-reader): enforce plugin compatibility and package policy`

6. **Task 6 — Add dedicated bounded external probe and authentication RPC**
   Commit: `3ad6699 feat(source-reader): add typed external authentication RPC`

## Verified behavior

- Candidate activation follows `initialize → healthCheck → database publication → registry publication`; the previous active version is stopped only after the candidate is published.
- Initialization, health, registry-resolution, and compatibility failures preserve the previous active version.
- Source Reader runtime SemVer, capability contract versions, extension versions, and extension schemas are checked before activation.
- Required incompatible extensions quarantine the package; invalid optional extensions are omitted with deterministic diagnostics.
- Native addons, executable files, executable binary formats, symbolic links, traversal, and checksum mismatches are rejected by package policy.
- External `probeCanHandle`, `login`, and `resumeChallenge` use dedicated RPC operations with bounded DTOs.
- External custom authentication receives only manifest-declared credential fields; repository, vault, actor roles, full `PluginContext`, and undeclared secrets do not cross the sandbox boundary.
- Persisted auth challenges bind plugin version and resolved route identity; changed bindings fail with `SESSION_BINDING_MISMATCH`.
- Form-login configuration is sourced from the validated plugin manifest and host code retains session persistence and routed transport ownership.

## Batch 2 verification evidence

- `npm run check`: pass
- `npm run check:lockfile`: pass
- API, crawler, and frontend architecture/contract gates: pass
- Prettier and Shared/API/Web TypeScript checks: pass
- Focused integration command: **22/22 pass**
  - `source-plugin-lifecycle-activation.test.ts`
  - `source-plugin-activation.test.ts`
  - `source-plugin-health.test.ts`
  - `source-plugin-installation.test.ts`
  - `source-reader-external-auth-rpc.test.ts`
  - `source-reader-session-login.test.ts`
  - `source-reader-auth-challenge.test.ts`
- Focused regression command: **17/17 pass**
  - `source-plugin-compatibility.test.ts`
  - `source-plugin-package-security.test.ts`
  - `source-reader-standard-auth.test.ts`
- Working tree after Task 6 commit: clean

## Exact continuation point

Resume at:

```text
Task 7 — Validate Concrete Capability Results and Activated Extensions
```

Do not repeat Tasks 1–6. Continue test-first from:

```text
tests/regression/source-reader-extension-validation.test.ts
```

The next execution batch is Tasks **7–9**. Stop immediately after Task 9 to create the next checkpoint ZIP.
