# Novel Tool V3 Subproject 3 Task 3 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Task 1, Scaffold the Parallel `web-next` Runtime: complete.
- Subproject 3, Task 2, Add the Strict TypeScript-AST FSD Guard: complete.
- Subproject 3, Task 3, Port the Domain-Free Shared Platform and Visual Foundation: complete.
- Task 2 checkpoint commit: `9f97f63` (`docs: checkpoint v3 subproject 3 task 2`).
- Task 3 implementation commit: `7f771e7` (`feat: add domain free web platform`).
- Working branch: `feat/v3-web-next-shared-foundation`.
- No known blocker remains for Subproject 3, Task 4.

## Completed Scope

- Added generic HTTP envelope parsing, API errors, JSON/form-data requests, and HTTP-204 handling.
- Added a shared `createQueryClient()` factory and default query client.
- Replaced entity-aware cache persistence with injected `QueryPersistenceOptions`, including `shouldPersist(query)` policy ownership.
- Added generic catalog composition and an `I18nProvider` that accepts caller catalogs and an optional caller-owned error interpreter.
- Added domain-free shared utilities for class composition, debounced values, and scroll restoration.
- Added generic realtime primitives:
  - `ConnectionStatus` and the three-state connection contract.
  - `createEventStream()` with caller-supplied JSON decoder and value/status/error callbacks.
  - `createBatchQueue()` for caller-owned values and consumers.
- Ported all 51 TypeScript/TSX files in the current shared UI primitive surface.
- Ported the current visual token and motion CSS while removing reader-owned and feature-named tokens, selectors, keyframes, and runtime state.
- Added `AppThemeProvider` for application theme, accent, density, and application-font preferences only.
- Added exact `web-next` dependencies required by the copied primitive and query libraries.
- Kept the lockfile on portable `registry.npmjs.org` URLs.
- Added shared-foundation regression coverage, including behavioral tests for catalog composition, event streams, and batching.

## Locked Decisions

- Shared query persistence stores no entity-root knowledge. Callers provide `buster`, `maxAgeMs`, and `shouldPersist(query)`.
- The IndexedDB cache name may retain the `novel-tool` product prefix because the architecture contract explicitly permits technical product storage prefixes.
- Shared localization owns only generic application strings. Product catalogs and product-specific error interpretation are injected by higher layers.
- `createEventStream()` parses `MessageEvent.data` as JSON before passing the value to the caller decoder.
- Shared realtime does not know query keys, resources, IDs, or invalidation policy.
- Shared batching preserves insertion order, creates one batch per window, and discards pending values on disposal.
- Reader preferences, reader data attributes, reader custom properties, reader motion, and reader persistence remain deferred to Task 11 feature ownership.
- The current UI primitive markup is retained. The only intentional source-level adaptations are:
  - the default search translation key is generic `common.search`;
  - the action-feedback timing dependency is named `clock` instead of domain-conflicting `scheduler`.
- Theme runtime remains independent from app-provider wiring; app composition is handled by the later shell/provider task.
- Task 4 entity code has not been started.

## RED -> GREEN Evidence

After dependencies were restored from the checkpoint lockfile, the first shared-foundation regression run reported 8 failures because the Task 3 shared files and directories did not exist.

Additional verification-driven failures were resolved before commit:

- The architecture guard rejected the copied action-feedback abstraction because its `scheduler` declaration conflicted with domain ownership. It was renamed to a generic clock abstraction.
- Node-based public API import exposed unsafe direct access to `import.meta.env`; the existing config now uses optional access while preserving the browser default.
- The package manager initially wrote environment-internal registry URLs for newly added dependencies; the lockfile was normalized and passed the portability checker.

The final shared-foundation tests pass after the minimal implementation and domain extraction.

## Fresh Verification

The following commands completed successfully from a clean dependency installation based on `package-lock.json`:

```powershell
npm ci
node --import tsx --test tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-scaffold.test.ts
npm run check:web-next-arch
npm run check:web-next
npm run build:web-next
npm run build:web
npm run check:lockfile
npx prettier --check apps/web-next/package.json apps/web-next/src/shared/api apps/web-next/src/shared/config/api.ts apps/web-next/src/shared/i18n apps/web-next/src/shared/lib apps/web-next/src/shared/realtime apps/web-next/src/shared/theme apps/web-next/src/shared/ui tests/regression/web-next-shared-foundation.test.ts
git diff --check
```

Recorded results:

- Shared, architecture, and scaffold regression tests: 22 pass, 0 fail.
- Real `apps/web-next` architecture check: pass.
- `web-next` TypeScript check: pass.
- `web-next` production build: pass with Vite `8.1.4`.
- Current `apps/web` production build: pass with Vite `8.1.4`.
- Lockfile portability: pass.
- Targeted formatting check: pass.
- Whitespace/error-marker check: pass.
- Shared UI primitive parity: 51 of 51 current TypeScript/TSX files present.

The full repository regression and integration suites were not rerun for this frontend shared-foundation task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 4, build Library, Chapter, Task, Scheduler, and Search entities.

Do not begin Task 5 before Task 4 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
