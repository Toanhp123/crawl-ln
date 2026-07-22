# Novel Tool V3 Subproject 3 Task 15 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Tasks 1 through 14: complete.
- Subproject 3, Task 15, Port Sources and Settings, Prove Browser Parity, and Complete Frontend Verification: complete at the source, architecture, type, contract, regression, and test-discovery layers.
- Task 14 checkpoint commit: `1c38463` (`docs: checkpoint v3 subproject 3 task 14`).
- Task 15 implementation commit: `a1661a2` (`feat: complete v3 frontend parity`).
- Working branch: `feat/v3-web-next-frontend-parity`.
- Subproject 4 has not been started.

## Completed Scope

- Added real `/sources`, `/sources/new`, `/sources/:pluginId`, and `/settings` page modules and replaced their foundation route loaders.
- Preserved Sources section state in `?section=` with invalid-section normalization.
- Added Source Reader overview, plugin detail, credentials, network profiles, authentication challenges, inspector, and system health widgets with public `index.ts` boundaries.
- Composed only public entity reads and feature writes; pages own URL/view state and no HTTP or TanStack mutation logic.
- Preserved optimistic plugin enable/disable behavior, permission review, diagnostics, credential and network administration, challenge resolution, and secret-safe inspector workflows.
- Added Settings hub composition for appearance, language, reader preferences, scheduler execution, backup/restore, search-index rebuild, export guidance, system health, version, and build metadata.
- Added EN/VI app-shell copy required by final Sources and Settings composition.
- Refactored frontend contract checking into `checkWebContracts(webRoot)` and kept separate current/next CLIs.
- Added the Web Next contract guard and frontend completion regressions.
- Added dual-preview Playwright configuration for current web on `4173` and Web Next on `4174`, with Web Next as the default base URL.
- Made existing browser API intercepts base-URL neutral through `**/api/**` patterns.
- Added semantic parity browser specifications for `/library`, `/activity`, `/sources`, and `/settings`.
- Added root scripts `check:web-next-contracts`, `test:e2e:web-next`, and `verify:v3:frontend`.

## Locked Decisions

- Sources and Settings pages compose public slices only. All Source Reader writes remain feature-owned and all query keys/invalidation remain entity-owned.
- Source Reader credentials, proxy secrets, passwords, OTP values, and raw error payloads are not stored in page or widget state beyond the existing feature-local forms.
- Settings uses generic provider commands and public feature controls; it does not own theme, language, reader, backup, scheduler, or search mutations.
- Browser specs use backend-base-neutral intercepts and dual current/next preview servers.
- Current and next frontend contract validation share one parameterized checker but retain independent CLIs.
- Subproject 4 must not begin until this checkpoint is reviewed. The next task is Subproject 4 Task 1, Add One Full V3 Candidate Verification Command.

## RED -> GREEN Evidence

The first completion-test run failed before executing assertions because `scripts/lib/web-contracts.mjs` did not exist. The first Playwright run failed because `playwright.web-next.config.ts` did not exist. These were the expected RED conditions for the final screens, contract library, and dual-preview setup.

After the initial GREEN implementation, TypeScript exposed a real mismatch in `SourceCredentialAuthActions`: the final public component accepts `credentialId`, not a credential object plus profile list. The credentials widget was corrected to use the public signature without weakening types.

The focused completion and contract tests then passed. Full Task 1-15 regression execution confirmed no earlier frontend, reader, Source Reader, architecture, or ownership behavior regressed.

## Fresh Verification

The following checks completed after the final source changes:

```powershell
node --loader /tmp/task14-ts-loader.mjs --test <Task 1-15 Web Next, reader, and Source Reader regression files>
node scripts/check-web-next-architecture.mjs
node scripts/check-web-next-contracts.mjs
node scripts/check-web-contracts.mjs
node scripts/check-reader-engine-architecture.mjs
node node_modules/typescript/bin/tsc -p apps/web-next/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p packages/reader-engine/tsconfig.json --noEmit
node scripts/prepare-packages.mjs
node scripts/prepare-reader-engine.mjs
node --loader /tmp/task14-ts-loader.mjs --test packages/reader-engine/tests/*.test.ts
node scripts/check-lockfile-portability.mjs
node scripts/check-docs.mjs
prettier --check <Task 15 changed paths>
git diff --check
node node_modules/@playwright/test/cli.js test --list --config playwright.web-next.config.ts
node scripts/check-api-next-architecture.mjs
node node_modules/typescript/bin/tsc -p apps/api-next/tsconfig.json --noEmit
node --experimental-sqlite --loader /tmp/task14-ts-loader.mjs --test tests/contract/*.test.ts
```

Recorded results:

- Selected Task 1-15 Web Next, reader, and Source Reader regressions: 135 pass, 0 fail.
- Task 15 focused completion and HTTP contract tests: 8 pass, 0 fail.
- Reader-engine package tests: 8 pass, 0 fail.
- Current/next backend contract suite: 18 pass, 0 fail.
- Web Next FSD architecture check: pass.
- Reader-engine purity check: pass.
- API-next architecture check: pass.
- Current web, Web Next, reader-engine, and API-next TypeScript checks: pass.
- Current and next frontend contract CLIs: pass.
- Package preparation and reader-engine production build: pass.
- Lockfile portability, documentation, Prettier, and whitespace checks: pass.
- Playwright successfully loaded the dual-preview config and discovered 13 mobile Chromium tests across 7 files.

## Environment-Limited Verification

Both current and next Vite production builds were attempted after their TypeScript checks. Vite failed before source bundling because the available dependency tree was installed on Windows and lacks the Linux optional native package `@rolldown/binding-linux-x64-gnu`.

Because neither preview bundle can be produced in this environment, the 13 discovered browser tests could not be executed against ports `4173` and `4174`. This is an environment dependency limitation, not a TypeScript, architecture, HTTP-contract, or regression failure. Run a normal Linux `npm ci` with registry access, then execute:

```powershell
npm run verify:v3:frontend
npm run verify:v3:backend
npm run check
```

The full backend regression and integration suites were not rerun in this isolated final frontend task. API-next architecture/type checks and all 18 current/next contract tests remained green.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-4-cutover-cleanup.md`
- Next task: Subproject 4 Task 1, Add One Full V3 Candidate Verification Command.

Do not perform cutover, rename canonical applications, or delete legacy applications before Subproject 4 follows its own task-by-task RED -> GREEN -> REFACTOR cycle and checkpoint discipline.
