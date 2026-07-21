# Novel Tool V3 Subproject 3 Task 1 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Task 1, Scaffold the Parallel `web-next` Runtime: complete.
- Environment-isolation baseline commit: `48aa4c7` (`fix: isolate api-next environment configuration`).
- Task implementation commit: `0d11283` (`feat: scaffold v3 web runtime`).
- Checkpoint tag: `checkpoint/v3-subproject-3-task-1`.
- Working branch: `feat/v3-web-next-scaffold`.
- No known blocker remains for Subproject 3, Task 2.

## Completed Scope

- Added the parallel `apps/web-next` npm workspace as `@novel-tool/web-next`.
- Preserved the current `apps/web` runtime and its development port `5173`.
- Configured `web-next` development port `5174` and preview port `4174`.
- Configured the `/api` development proxy to API Next at `http://localhost:3100`.
- Added an overridable `API_BASE_URL` with default `http://127.0.0.1:3100`.
- Preserved package-version and Git build-ID injection through `__APP_VERSION__` and `__APP_BUILD__`.
- Added the minimal `BrowserRouter` provider and foundation routes at `/` and `/library`.
- Added root scripts `dev:web-next`, `check:web-next`, and `build:web-next`.
- Added a regression test that locks the workspace identity, isolated ports, API defaults, root scripts, and unchanged current-web defaults.
- Updated `package-lock.json` with npm `10.9.2` while preserving portable public npm registry URLs and Vite `8.1.4`.

## Locked Decisions

- `apps/web-next` remains a parallel runtime; it does not replace or modify `apps/web` in this task.
- `AppProviders` contains only `BrowserRouter` until later provider tasks.
- The initial router renders only `FoundationPage` at `/` and `/library`.
- No shared visual foundation, entities, features, realtime routing, reader engine, or production screen migration belongs to Task 1.
- API Next remains the V3 backend oracle on port `3100`.
- The real package-local `apps/api-next/.env` remains ignored and must be preserved when moving this checkpoint between workspaces.

## Fresh Verification

The following commands completed successfully after a clean dependency install from `package-lock.json`:

```powershell
node --import tsx --test tests/regression/web-next-scaffold.test.ts
npm run check:web-next
npm run build:web-next
npm run build:web
npm run check:lockfile
npx prettier --check apps/web-next tests/regression/web-next-scaffold.test.ts package.json
git diff --check
```

Recorded results:

- Scaffold regression tests: 2 pass, 0 fail.
- `web-next` TypeScript check: pass.
- `web-next` production build: pass with Vite `8.1.4`.
- Current `apps/web` production build: pass with Vite `8.1.4`.
- Lockfile portability: pass.
- Targeted formatting check: pass.
- Whitespace/error-marker check: pass.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 2, add the strict TypeScript-AST FSD guard.

Do not begin Task 3 before Task 2 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
