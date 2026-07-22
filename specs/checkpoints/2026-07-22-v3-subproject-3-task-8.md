# Novel Tool V3 Subproject 3 Task 8 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Task 1, Scaffold the Parallel `web-next` Runtime: complete.
- Subproject 3, Task 2, Add the Strict TypeScript-AST FSD Guard: complete.
- Subproject 3, Task 3, Port the Domain-Free Shared Platform and Visual Foundation: complete.
- Subproject 3, Task 4, Build Library, Chapter, Task, Scheduler, and Search Entities: complete.
- Subproject 3, Task 5, Build Source Reader Entity Query Slices: complete.
- Subproject 3, Task 6, Implement Library and Task Action Features: complete.
- Subproject 3, Task 7, Implement Scheduler, Search, Export, Backup, and Settings Features: complete.
- Subproject 3, Task 8, Implement Source Reader Administration Features: complete.
- Task 7 checkpoint commit: `98b4213` (`docs: checkpoint v3 subproject 3 task 7`).
- Task 8 implementation commit: `3c536d2` (`feat: add v3 source reader actions`).
- Working branch: `feat/v3-web-next-source-reader-features`.
- No Task 9 realtime resource routing has been started.

## Completed Scope

- Added `install-source-plugin` with multipart upload, a 20 MiB client-side limit, localized feedback, and a reusable install form.
- Added `manage-source-plugins` with enable, disable, and remove actions. Enable/disable uses an optimistic cache update with explicit rollback and public entity invalidation.
- Added `review-source-permissions` with approve/deny actions over the Source Plugin diagnostics entity query.
- Added `test-source-plugin` with the frozen plugin test endpoint and reusable action UI.
- Added `manage-source-credential` with feature-local create, replace-secret, and delete workflows. Credential secret request types and form state remain inside the feature.
- Added `authenticate-source-credential` with login, logout, and credential test actions plus credential/challenge invalidation.
- Added `manage-source-network-profile` with create, update, delete, and test actions. Proxy passwords remain feature-local and preserve the existing endpoint/config request semantics.
- Added `resolve-source-auth-challenge` with respond/cancel actions, credential/challenge invalidation, and local OTP clearing.
- Added `inspect-source-url` with identify, metadata, chapter-list, chapter-content, search, and latest-updates workflows over the frozen Source Reader inspection endpoints.
- Extended the generic API error boundary to retain an optional `x-request-id` and expose `getPublicErrorDescription()`, which renders only a public error code and optional request ID.
- Added English and Vietnamese catalogs plus reusable UI for all nine Task 8 feature slices.
- Added regression coverage for optimistic rollback, exact HTTP/form-data contracts, secret lifecycle, redacted public errors, public APIs, and semantic FSD ownership.

## Locked Decisions

- All Source Reader writes and administration workflows remain feature-owned. `entities` stay read-only, and `app`/`pages` do not own these mutations.
- Feature hooks consume only entity public indexes and public invalidation adapters. They do not deep-import entity internals.
- Plugin enable/disable updates cached plugin state optimistically, rolls back the exact previous collection on failure, and invalidates the plugin collection after settlement.
- Credential secrets, proxy passwords, login responses, OTP values, and inspection inputs remain feature-local transient state. They are not added to entities, shared providers, query persistence, or durable storage.
- Secret form state is cleared after settlement and when its UI closes.
- User-visible Task 8 errors use only the stable API error code and optional request ID. Server messages, details, submitted secrets, and response secrets are not rendered.
- Network profile updates preserve the current redacted-edit behavior: an unchanged existing proxy route may be saved without re-entering its endpoint, while a changed route or secret requires a valid proxy URL.
- Inspection workflows preserve the existing Source Reader endpoint and pagination contracts. Realtime resource routing remains deferred to Task 9.
- Feature catalogs are exported but remain uncomposed until the app-shell/provider composition task.
- No Task 9 code has been created.

## RED -> GREEN Evidence

The first Task 8 regression run reported 6 failures because all nine Source Reader administration feature slices and the public redacted error helper were missing.

The GREEN implementation added the administration APIs, hooks, feature-local models, catalogs, reusable UI, public indexes, optimistic rollback, and redacted error metadata. The focused Task 8 regression test then passed 6/6.

Further review cycles locked:

- credential and proxy secret clearing after use and close;
- exact multipart and JSON endpoint semantics;
- public error output containing only code and optional request ID;
- network profile redacted-edit compatibility;
- feature-only mutation ownership and public entity invalidation usage.

## Fresh Verification

The following Task 8 checks completed successfully after formatting:

```powershell
node --experimental-sqlite --loader /tmp/task8-ts-loader.mjs --test tests/regression/web-next-scaffold.test.ts tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-shared-foundation.test.ts tests/regression/web-next-core-entities.test.ts tests/regression/web-next-source-reader-entities.test.ts tests/regression/web-next-library-task-features.test.ts tests/regression/web-next-settings-data-features.test.ts tests/regression/web-next-source-reader-features.test.ts tests/regression/source-reader-web-console-contract.test.ts tests/regression/source-reader-web-contract.test.ts
npm run check:web-next-arch
npm run check:web-next
npm run check:web-contracts
npm run check:lockfile
node node_modules/prettier/bin/prettier.cjs --check apps/web-next/src/shared/api/errors.ts apps/web-next/src/shared/api/http.ts apps/web-next/src/shared/api/index.ts apps/web-next/src/features/authenticate-source-credential apps/web-next/src/features/inspect-source-url apps/web-next/src/features/install-source-plugin apps/web-next/src/features/manage-source-credential apps/web-next/src/features/manage-source-network-profile apps/web-next/src/features/manage-source-plugins apps/web-next/src/features/resolve-source-auth-challenge apps/web-next/src/features/review-source-permissions apps/web-next/src/features/test-source-plugin tests/regression/web-next-source-reader-features.test.ts
git diff --check
```

Recorded results:

- Task 1-8 frontend and Source Reader security/contract regression tests: 51 pass, 0 fail.
- Real `apps/web-next` architecture check: pass.
- `web-next` TypeScript check: pass.
- Frozen frontend contract check: pass.
- Lockfile portability: pass.
- Targeted formatting check: pass.
- Whitespace/error-marker check: pass.

The clean checkpoint ZIP does not contain `node_modules`. During this session the configured npm registry returned HTTP 503, so Linux-native optional dependencies could not be restored. The available dependency tree came from the Windows source ZIP. Consequently:

- the normal `tsx` runner was blocked by the Windows `esbuild` binary;
- `npm run build:web-next` completed TypeScript compilation and then stopped because the Windows `vite` shim was not executable on Linux;
- invoking Vite's JavaScript entrypoint directly confirmed that `@rolldown/binding-linux-x64-gnu` was unavailable;
- a temporary untracked TypeScript compiler loader was used only to execute the same Node test files on Linux;
- TypeScript compilation completed successfully through `npm run check:web-next` and the build command's TypeScript stage.

No production code, lockfile, or checkpoint artifact depends on the temporary loader or the copied dependency tree. Production builds should be rerun after a normal Linux `npm ci` when the registry is available.

The full repository regression and integration suites were not rerun for this frontend feature-ownership task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 9, move realtime resource routing into `app/realtime`.

Do not begin Task 10 before Task 9 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
