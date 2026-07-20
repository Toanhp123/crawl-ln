# Source Reader Post-Review Remediation Checkpoint

**Date:** 2026-07-20  
**Branch:** `feat/source-reader`  
**Runtime remediation commit:** `8d9be8a`  
**Documentation reconciliation commit:** `9506b68`  
**Plan:** `docs/superpowers/plans/2026-07-20-source-reader-post-review-remediation.md`

## Scope closed

This checkpoint supersedes the absolute completion claims in:

- `CHECKPOINT-PROGRESS.md`
- `docs/superpowers/checkpoints/2026-07-20-source-reader-final-review-remediation.md`

The original roadmap and first final-review remediation remain useful historical records, but they did not cover the gaps below.

## Runtime and contract fixes

1. **Bounded, exception-safe sandbox RPC**
   - Frames are preflighted iteratively before recursive Zod parsing.
   - Limits are 32 nesting levels, 10,000 traversed nodes, and approximately 512,000 bytes.
   - Cycles, exotic prototypes, symbol/non-enumerable fields, unsupported values, and parser exceptions fail closed.
   - Invalid plugin output terminates the sandbox and rejects pending work with `PLUGIN_RPC_PROTOCOL_INVALID` without an uncaught host exception.

2. **Request-specific timeout enforcement**
   - Reader HTTP DTOs accept integer `timeoutMs` from 1 through 120,000.
   - The value is propagated through `PluginInvocation`.
   - External deadlines use the request timeout rather than only the runtime default.
   - In-process calls are raced against both timeout and caller cancellation, with the composed signal exposed to the plugin.

3. **Least-privilege capability DTOs**
   - Capability requests are built by explicit operation-specific allowlists.
   - Actor ids, credential/network profile ids, request ids, freshness policy, host signals, and runtime metadata are not spread into plugin requests.

4. **Progress-safe pagination and streaming**
   - `hasMore` without a cursor, empty non-final pages, unchanged plugin cursors, invalid signed offsets, repeated host cursors, and excessive page counts fail closed.
   - Crawler chapter streaming can no longer loop indefinitely on a non-progressing plugin.

5. **Public browser-required sources**
   - `runtime.requiresBrowser` is independent of authentication requirements.
   - Public JavaScript-heavy sources use a stable anonymous source-scoped identity.
   - Authenticated browser sessions continue to bind credential, session, actor, plugin version, and route identity.
   - Browser secret resolution is unavailable without an approved credential and rejects handles outside the active credential scope.

## Documentation reconciliation

- Corrected `.source-plugin` layout to `manifest.json`, `dist/index.js`, `checksums.json`, optional checked assets, and optional `signature.json`.
- Replaced worker-thread claims with the implemented supervised child-process sandbox and marked the original worker task superseded.
- Removed current VPN support claims; persisted legacy `vpn-gateway` rows are documented as fail-closed data.
- Updated browser semantics, timeout contract, RPC bounds, Source Reader milestones, roadmap amendments, and final-review module paths.
- Marked earlier absolute-completion checkpoints as superseded rather than deleting their historical evidence.

## Fresh verification evidence

Verification was performed from the repository root after the runtime commit and documentation updates.

- `npm run check`: **pass** as the completed check stage of `npm run verify`.
  - lockfile portability: pass
  - API architecture: pass
  - crawler architecture: pass
  - frontend FSD architecture: pass
  - frontend contracts: pass
  - Prettier: pass
  - Shared/API/Web TypeScript: pass
- Full regression suite, split into four deterministic Node test shards to avoid host oversubscription: **390/390 pass, 0 fail**.
  - shard 1: 100 pass
  - shard 2: 104 pass
  - shard 3: 102 pass
  - shard 4: 84 pass
- Full integration suite: **92 pass, 1 conditional Chromium skip, 0 fail**.
- Focused Source Reader integration suite: **44 pass, 1 conditional Chromium skip, 0 fail**.
- Source Reader and crawler regression subset: **81/81 pass, 0 fail**.
- Shared/API/Web production build: **pass**.
- `git diff --check`: **pass**.

## Verification constraints

- The unsharded `npm run verify` completed lockfile, architecture, formatting, and TypeScript checks, then exceeded the environment's 15-minute command limit while Node oversubscribed the full regression glob. The same complete regression set passed as four shards, and the remaining integration and build stages passed independently.
- Playwright E2E could not execute application assertions because the system Chromium enterprise policy returned `net::ERR_BLOCKED_BY_ADMINISTRATOR` for `http://127.0.0.1:4173`. All six tests failed at navigation before application code ran. No system policy was modified during this remediation.
- The browser-runtime integration test remains conditionally skipped when `CHROMIUM_PATH` is not supplied.

## Handoff packaging

- The source handoff is generated from Git-tracked files plus `.git` history, so tracked plugin fixture bundles under `dist/` are preserved while generated workspace build output and `node_modules` are excluded.
- ZIP integrity is checked with `unzip -t`.
- The restored repository is checked with `git fsck --full`, a clean `git status`, the expected branch/HEAD, and explicit presence checks for tracked external-plugin fixture bundles.
- A SHA-256 sidecar is generated for the final archive outside the repository.

## Current acceptance state

The independently identified Source Reader runtime and documentation gaps are remediated and covered by regression/integration tests. The only unverified acceptance surface in this environment is browser E2E navigation blocked by host policy, not an observed application assertion failure.
