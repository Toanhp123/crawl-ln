# Source Reader Implementation Checkpoint

**Checkpoint date:** 2026-07-20  
**Branch:** `feat/source-reader`  
**Primary roadmap:** `docs/superpowers/plans/2026-07-19-source-reader-implementation-roadmap.md`

## Verified implementation position

The recoverable branch now contains two completed plans:

- Core Runtime Plan — Tasks 1–6: **complete and committed**.
- Crawler Cutover Plan — Tasks 1–5: **complete and committed**.
- State/Security Plan: **not started**.
- External Plugins Plan: **not started**.
- Auth/Browser Plan: **not started**.
- HTTP/Observability/Finalization Plan: **not started**.

There is no intentional RED test at this checkpoint. The next test-first stopping point is State/Security Task 1.

## Delivered implementation

### Core Runtime

- Stable Source Reader public request/result/error contracts.
- Capability-based plugin manifest and plugin contract validation.
- Per-capability registry with host/path matching, priorities, wildcard hosts, and duplicate-ID rejection.
- Constrained plugin context and in-process runtime.
- Built-in NovelCool plugin for identify, metadata, oldest-first chapter list, and sanitized chapter content.
- Result validation, memory cache, signed HMAC cursor, fallback selection, paged reads, and streaming.
- Clock-owned cache expiry and module-managed opaque cursor continuation.

### Crawler Cutover

- Standalone Source Reader module composed before Crawler.
- Analyze flow uses a crawler-owned Source Reader port while retaining robots policy and same-host safety.
- Chapter fetch uses Source Reader while retaining robots and crawl-delay ordering.
- Preview HTTP routes:
  - `POST /api/source-reader/identify`
  - `POST /api/source-reader/metadata`
  - `POST /api/source-reader/chapter-list`
  - `POST /api/source-reader/chapter-content`
- Typed Source Reader errors are part of the shared API error contract.
- Removed the complete legacy backend path:
  - SourceProfile schemas/config/repository/detector/engine
  - selector and old plugin adapters
  - dynamic plugin module and `/api/plugins` backend route
  - legacy `sources/` packages and obsolete tests
- Shared host allowlist normalization was retained at `apps/api/src/shared/url/source-host.ts`.

## Focused commits

```text
be2bcc1 refactor(source-reader): remove legacy source paths
bae7a51 feat(source-reader): expose reader preview API
9fa72d5 refactor(crawler): fetch chapters through source reader
24ebac7 refactor(crawler): analyze through source reader
ea0a1d2 feat(source-reader): compose standalone module
e61be35 feat(source-reader): implement core reader service
40a7120 feat(source-reader): add built-in NovelCool plugin
7cf89b5 feat(source-reader): add constrained in-process runtime
3ab4155 feat(source-reader): add capability plugin registry
0554697 docs: record source reader recovery checkpoint
f7cc277 feat(source-reader): define plugin capability contract
7aa336e feat(source-reader): define public contracts
```

A checkpoint documentation commit follows these implementation commits.

## Verification evidence

The following commands were run after the irreversible legacy removal:

```bash
npm run check:lockfile
npm run check
npm run test:regression
npm run test:integration
npm run build
```

Results:

- Lockfile portability: PASS.
- API architecture: PASS.
- Crawler platform guard: PASS.
- Frontend architecture and contract guards: PASS.
- TypeScript and Prettier checks: PASS.
- Regression: **316 tests passed, 0 failed**.
- Integration: **32 tests passed, 0 failed**.
- Shared/API/Web production builds: PASS.

A combined `npm run verify` invocation was also attempted, but the execution wrapper terminated it on elapsed-time limits while regression tests were still running. Its exact component commands above were then run independently to completion and all passed.

## Exact next task

Continue with:

```text
docs/superpowers/plans/2026-07-19-source-reader-state-security.md
Task 1: Add Source Reader database migrations and ownership regression
```

Test-first sequence:

```bash
# Create these RED tests first:
tests/integration/source-reader-schema.test.ts
tests/regression/source-reader-persistence-boundary.test.ts

# Confirm missing source_reader_* tables:
npm run build:shared && node --experimental-sqlite --import tsx --test \
  tests/integration/source-reader-schema.test.ts \
  tests/regression/source-reader-persistence-boundary.test.ts

# Then add migrations 15, 16, and 17 in:
apps/api/src/shared/database/sqlite.ts
```

Required tables are listed in the State/Security plan. Do not create a compatibility layer or restore any removed source-profile/plugin backend path.

## Archive notes

The checkpoint archive should include `.git/`, `.checkpoint/`, plans/specs, and source/tests. It should exclude `node_modules/`, generated `dist/` directories, transient storage, and test/build caches.
