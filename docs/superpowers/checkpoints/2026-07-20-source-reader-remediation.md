# Source Reader Security Remediation Checkpoint

**Date:** 2026-07-20
**Branch:** `feat/source-reader`
**Plan:** `docs/superpowers/plans/2026-07-20-source-reader-security-remediation.md`
**Progress:** **3/12 remediation tasks complete**

## Completed batch 1

1. **Task 1 — Replace worker-thread trust boundary with a supervised process sandbox**
   Commit: `2dfd75d feat(source-reader): sandbox external plugins in supervised processes`

2. **Task 2 — Route HTTP and Chromium traffic through resolved network profiles**
   Commit: `192c7f3 feat(source-reader): route HTTP and browser traffic through profiles`

3. **Task 3 — Separate cache scope identities and bind sessions to plugin version and route**
   Commit: `91695f6 fix(source-reader): isolate cache scopes and session bindings`

## Verified behavior

- External plugins run in supervised Node.js processes using the SES boundary and deny ambient filesystem, subprocess, raw socket, worker, environment, and direct fetch authority.
- Sandbox cancellation and timeout terminate the process handle.
- HTTP and Chromium receive the resolved direct/HTTP/HTTPS/SOCKS route; required route failures do not retry directly.
- Cache keys bind plugin ID/version, capability and extension contracts, normalized request fingerprint, route identity, scope, and scope-specific identity.
- `public`, `account`, `user`, and `session` cache identities are independent.
- Active session lookup requires the exact plugin version.
- Required route-bound sessions reject direct or alternate network profiles with `SESSION_BINDING_MISMATCH`.
- Browser pooling identity includes actor, plugin version, credential/account, session, profile, and normalized route identity.

## Batch 1 verification evidence

- `npm run check`: pass
- Focused regression command: **14/14 pass**
  - `source-reader-external-process-sandbox.test.ts`
  - `source-reader-runtime-context.test.ts`
  - `source-reader-service.test.ts`
- Focused integration command: **9/9 pass**
  - `source-reader-network-routing.test.ts`
  - `source-reader-cache-scope-identity.test.ts`
  - `source-reader-session-binding.test.ts`
- Prettier: pass
- Shared/API/Web TypeScript checks: pass
- API, crawler, and frontend architecture gates: pass

## Exact continuation point

Resume at:

```text
Task 4 — Add Plugin Lifecycle and Atomic Candidate Activation
```

Do not repeat Tasks 1–3. Continue test-first from the lifecycle ordering test in:

```text
tests/integration/source-plugin-lifecycle-activation.test.ts
```

The next execution batch is Tasks **4–6**. Stop immediately after Task 6 to create the next checkpoint ZIP.
