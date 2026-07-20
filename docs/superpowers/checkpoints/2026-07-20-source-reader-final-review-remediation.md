# Source Reader Final Review Remediation Checkpoint

**Date:** 2026-07-20
**Branch:** `feat/source-reader`
**Plan:** `docs/superpowers/plans/2026-07-20-source-reader-final-review-remediation.md`
**Progress:** **3/4 tasks complete**

## Completed batch

1. **Task 1 — Make plugin activation, disable, and quarantine state consistent**
   Commit: `ac58273 fix(source-reader): make plugin publication atomic`

2. **Task 2 — Enforce exact session route binding for every session**
   Commit: `a7369ac fix(source-reader): bind sessions to exact network route`

3. **Task 3 — Use one external plugin registration factory at activation and startup**
   Commit: `446911d refactor(source-reader): unify external plugin registration`

## Verified behavior

- Registry publication failure restores the previous active database version and previous registry snapshot.
- Disable and quarantine do not remove the runtime registration before the store transition succeeds.
- Active-version quarantine publication failure can restore the previous active version through `PluginStorePort.restoreActivation()`.
- Optional sessions are not reused across direct/proxy or proxy/proxy route changes.
- Required sessions continue to return the typed `SESSION_BINDING_MISMATCH` error for route mismatch.
- Activation-time and startup-time external registrations are built by one `ExternalPluginRegistrationFactory`.
- Both registration paths expose lifecycle, `probeCanHandle`, custom login, and resumable challenge proxies with the same bounded RPC DTOs.

## Verification evidence

- Focused integration command: **19/19 pass**.
  - `source-plugin-lifecycle-activation.test.ts`
  - `source-reader-session-binding.test.ts`
  - `source-reader-external-registration-parity.test.ts`
  - `source-reader-external-auth-rpc.test.ts`
  - `source-plugin-activation.test.ts`
  - `source-plugin-health.test.ts`
- `npm run check`: pass.
- API, crawler, frontend architecture and web contract gates: pass.
- Prettier and Shared/API/Web TypeScript checks: pass.
- `git diff --check`: pass.

## Next task

**Task 4 — Add Browser and Complete HTML RPC Parity**

Task 4 has not been started. It must add host-mediated browser operations and opaque HTML document/node handles for external plugins, then run exact repository verification and E2E acceptance.

## Checkpoint rule

No Task 4 implementation may begin until this checkpoint is committed, archived with Git history, hashed, and successfully restore-tested.
