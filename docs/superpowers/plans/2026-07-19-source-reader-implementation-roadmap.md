# Source Reader Implementation Roadmap

> **Implementation amendment:** The original external-plugin worker-thread task was superseded by `2026-07-20-source-reader-security-remediation.md`, which implements a supervised child-process sandbox with constrained loading and bounded typed RPC. Current acceptance is recorded in `../checkpoints/2026-07-20-source-reader-post-review-remediation.md`.

The approved Source Reader design is implemented as six ordered plans. Each plan leaves the repository compiling and provides an independently reviewable test gate. The final state contains no legacy source-profile or old plugin execution path.

## Execution order

1. [`2026-07-19-source-reader-core-runtime.md`](./2026-07-19-source-reader-core-runtime.md)
   - Public contracts, errors, manifest validation, matcher registry, in-process runtime, built-in NovelCool plugin, result validation, cursor codec, and memory cache.
2. [`2026-07-19-source-reader-crawler-cutover.md`](./2026-07-19-source-reader-crawler-cutover.md)
   - Composition root, crawler integration, reader HTTP preview endpoints, removal of SourceProfile/SelectorHtmlAdapter/old plugin module, and regression replacement.
3. [`2026-07-19-source-reader-state-security.md`](./2026-07-19-source-reader-state-security.md)
   - SQLite-owned state, SecretVault, credentials, network profiles, sessions, challenges, runtime-context resolution, and persistent scoped cache.
4. [`2026-07-19-source-reader-external-plugins.md`](./2026-07-19-source-reader-external-plugins.md)
   - `.source-plugin` verification, trust and permission approval, installation/activation, an originally planned isolated runtime later replaced by the supervised process sandbox, health checks, and quarantine.
5. [`2026-07-19-source-reader-auth-browser.md`](./2026-07-19-source-reader-auth-browser.md)
   - Standard/custom authentication, browser worker, OTP/CAPTCHA/browser challenges, encrypted session material, and network-route binding.
6. [`2026-07-19-source-reader-http-observability-finalization.md`](./2026-07-19-source-reader-http-observability-finalization.md)
   - Public/admin APIs, authorization boundary, error transport, metrics, circuit breakers, rate limiting, frontend endpoint migration, architecture checks, cleanup, and final verification.

## Cross-plan invariants

- Consumers import only `apps/api/src/modules/source-reader/public/*`.
- No task introduces `LegacySourceAdapter`, `SourceProfileCompatibilityPlugin`, `USE_NEW_SOURCE_READER`, or a fallback to the removed parser path.
- Built-in and external plugins use the same `SourceReaderPlugin` contract.
- External `local-unverified` plugins always run in the supervised process sandbox.
- Source Reader never persists novels, chapters, or crawl tasks.
- Crawler never imports Source Reader infrastructure, registry, repositories, runtime, or secret components.
- Plugin code never receives a master key, plaintext persisted secret, raw database handle, or unrestricted network/filesystem access.
- Every implementation task follows test-first development and ends with a focused commit.

## Final acceptance gate

Run from the repository root:

```bash
npm run verify
npm run test:e2e
```

Expected: both commands exit with status `0`, no source-profile configuration is required, no old plugin module remains, and the Sources UI operates through `/api/source-reader/*`.
