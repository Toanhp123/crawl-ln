# Novel Tool V3 Subproject 3 Task 2 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Task 1, Scaffold the Parallel `web-next` Runtime: complete.
- Subproject 3, Task 2, Add the Strict TypeScript-AST FSD Guard: complete.
- Task 1 checkpoint commit: `5526359` (`docs: checkpoint v3 subproject 3 task 1`).
- Task 2 implementation commit: `6c5aaa4` (`test: enforce semantic fsd in web next`).
- Working branch: `feat/v3-web-next-fsd-guard`.
- No known blocker remains for Subproject 3, Task 3.

## Completed Scope

- Added `checkWebNextArchitecture(projectRoot): Promise<string[]>` using the TypeScript compiler API.
- Added AST extraction for static imports, re-exports, import types, dynamic imports, and `require()` calls.
- Added TypeScript path-alias and relative-path resolution for the `@/* -> src/*` mapping.
- Enforced FSD upward-dependency direction and same-layer slice isolation.
- Rejected direct imports between page slices.
- Required external slice consumers to resolve through the slice-root `index.ts` public API.
- Required every `entities`, `features`, `widgets`, and `pages` slice to expose `index.ts`.
- Restricted direct TanStack query hooks to `entities` and mutation hooks to `features`.
- Rejected mutating HTTP methods in `app` and `pages`.
- Rejected domain declarations, object keys, import/export strings, string literals, and template-literal segments in `shared`.
- Rejected domain-owned shared CSS selectors/custom properties and reader-owned `data-reader-*`, `--reader-*`, and `.reader-*` markers.
- Preserved explicit technical exceptions for timer schedulers and the `novel-tool` product storage prefix.
- Added the `npm run check:web-next-arch` CLI gate.
- Added fixture-based regression coverage for valid and invalid architecture trees.

## Locked Decisions

- `checkWebNextArchitecture()` receives the `web-next` package root, not its `src` directory.
- Slice public APIs are the exact slice-root `index.ts`; nested indexes do not count as the external public surface.
- Same-slice internal imports remain allowed.
- Same-layer cross-slice imports remain forbidden even when they target another slice public index.
- Page slices cannot depend on other page slices.
- Query ownership is detected from TanStack named imports, aliases, namespace access, and CommonJS destructuring.
- Product-mutation HTTP detection is limited to statically recognizable mutating methods and HTTP-client/fetch call sites.
- Shared domain checks scan TypeScript declarations and literal content rather than comments.
- Shared CSS checks cover class selectors, data attributes, and custom properties.
- Task 3 shared-foundation code has not been started.

## RED -> GREEN Evidence

The first regression run failed with `ERR_MODULE_NOT_FOUND` because `scripts/lib/web-next-architecture.mjs` did not exist.

Additional review-driven RED cases were observed before their fixes:

- Shared domain CSS selector/custom-property fixture: expected 3 violations, received 0.
- Shared object-key/template-literal fixture: the expected domain violation was absent.
- Shared product endpoint strings ending at `/api/search`, `/api/backups`, and `/api/export`: expected 3 violations, received 0.

All of those fixtures pass after the minimal checker changes.

## Fresh Verification

The following commands completed successfully from a clean dependency installation based on `package-lock.json`:

```powershell
node --import tsx --test tests/regression/web-next-architecture-guard.test.ts tests/regression/web-next-scaffold.test.ts
npm run check:web-next-arch
npm run check:web-next
npm run build:web-next
npm run build:web
npm run check:lockfile
npx prettier --check scripts/lib/web-next-architecture.mjs scripts/check-web-next-architecture.mjs tests/regression/web-next-architecture-guard.test.ts package.json
git diff --check
```

Recorded results:

- Architecture and scaffold regression tests: 12 pass, 0 fail.
- Real `apps/web-next` architecture check: pass.
- `web-next` TypeScript check: pass.
- `web-next` production build: pass with Vite `8.1.4`.
- Current `apps/web` production build: pass with Vite `8.1.4`.
- Lockfile portability: pass.
- Targeted formatting check: pass.
- Whitespace/error-marker check: pass.

The full repository regression and integration suites were not rerun for this architecture-only task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 3, port the domain-free shared platform and visual foundation.

Do not begin Task 4 before Task 3 has its own RED -> GREEN -> REFACTOR cycle and checkpoint.
