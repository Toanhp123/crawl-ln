# Source Reader Security Remediation Checkpoint

**Date:** 2026-07-20
**Branch:** `feat/source-reader`
**Plan:** `docs/superpowers/plans/2026-07-20-source-reader-security-remediation.md`
**Progress:** **9/12 remediation tasks complete**

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

## Completed batch 3

7. **Task 7 — Validate concrete capability results and activated extensions**
   Commit: `8590d50 feat(source-reader): validate capability and extension contracts`

8. **Task 8 — Coordinate cache metadata, public stale refresh, and centralized invalidation**
   Commit: `009b9d8 feat(source-reader): coordinate cache and session invalidation`

9. **Task 9 — Route host and plugin logs through a bounded structured redaction boundary**
   Commit: `4ecfd8b fix(source-reader): enforce structured redacted logging`

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
- Search and latest-update results use concrete item schemas instead of `unknown`; required extension failures reject the invocation and optional extension failures remove only the invalid namespace with warnings.
- Cursor payloads bind the activated extension contract-version map and become invalid after extension contract changes.
- SQLite cache rows persist actual plugin/capability/scope/network metadata and indexed tags through migration 21.
- Only public cache entries may be served stale; refresh is single-flight, while account/user/session entries use hard TTL expiration.
- Credential, network, plugin, logout, and chapter-list changes use centralized scoped invalidation after successful persistence.
- Plugin and host logs pass through one bounded structured logger. Plugin metadata uses an allowlist; sensitive keys, URL query secrets, bodies, HTML, content, buffers, excessive depth, arrays, and byte size are omitted, redacted, or truncated.
- Sandbox `stdout` and `stderr` are never logged raw. The host records only stream name, byte count, and a SHA-256 preview hash; repeated output-policy violations quarantine and unregister the plugin.

## Batch 3 verification evidence

- `npm run check`: pass
- API, crawler, and frontend architecture/contract gates: pass
- Prettier and Shared/API/Web TypeScript checks: pass
- Focused regression command with sequential test execution: **10/10 pass**
  - `source-reader-extension-validation.test.ts`
  - `source-reader-structured-logging.test.ts`
  - `source-reader-external-process-sandbox.test.ts`
- Focused cache integration command: **6/6 pass**
  - `source-reader-cache-invalidation.test.ts`
  - `source-reader-public-stale-cache.test.ts`
- Additional Task 9 integration verification: **9/9 pass**
  - `source-plugin-health.test.ts`
  - `source-reader-auth-challenge.test.ts`
- Working tree after Task 9 commit: clean before checkpoint metadata update

## Exact continuation point

Resume at:

```text
Task 10 — Migrate Existing External Plugins, Sessions, and Cache Fail-Closed
```

Do not repeat Tasks 1–9. Continue test-first from:

```text
tests/integration/source-reader-fail-closed-migration.test.ts
```

The next execution batch is Tasks **10–12**. Stop immediately after Task 12 for final verification and the final remediation checkpoint ZIP.
