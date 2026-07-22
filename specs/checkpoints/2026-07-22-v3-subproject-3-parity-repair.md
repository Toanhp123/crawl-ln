# Novel Tool V3 Subproject 3 Parity Repair Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Frontend Foundation and Capability Migration: complete.
- Subproject 3 parity repair Tasks 1 through 9: complete.
- Working branch: `feat/v3-web-next-frontend-parity`.
- Subproject 4 has not been started.

## Completed Repair Scope

- Restored the Web Next Tailwind/PostCSS build pipeline and aligned style dependencies.
- Preserved reader sessions during route-only synchronization and prevented scroll resets while the URL catches up with the active chapter.
- Serialized reader edge loading by scroll direction so initially intersecting sentinels cannot starve the next-chapter load.
- Completed EN/VI slice catalogs, removed reflective catalog loading, and preserved lazy UI chunking.
- Moved generic maintenance orchestration to `shared`, protected backup restore, and included reader settings in backup round trips.
- Separated novel and content-search pagination ownership and restricted persisted query keys to the intended aggregate reads.
- Restored credential validation, reader return-state continuity, safe highlighted snippets, and the locked `invalidateForNovel` task API.
- Repaired all seven browser specifications, stabilized locale/readiness assumptions, and executed the 13-test mobile parity gate.
- Closed full-suite verification gaps for `backup.restoring` and stale regression mocks that still referenced `invalidateNovel`.

## Repair Commits

- `21b197a` - `fix: restore web-next css pipeline`
- `f80325c` - `chore: update web-next style dependencies`
- `185762f` - `fix: preserve reader session during url sync`
- `ee3bde6` - `fix: complete web-next localization catalogs`
- `b07feb9` - `fix: protect web-next backup restore`
- `2c6a490` - `fix: separate library search pagination`
- `7a685e1` - `fix: narrow web-next query persistence`
- `bfa9d5b` - `fix: restore web-next interaction parity`
- `477ac27` - `fix: complete web-next browser parity gate`
- `2ae3bc9` - `fix: close web-next verification gaps`

## Root-Cause Evidence

- Reader URL synchronization originally reset the viewport between `activeIndex` changing and React Router replacing the path. The route-sync predicate now distinguishes an in-window pending URL update from a real reader navigation.
- Under parallel browser load, both edge sentinels could intersect during initialization. The previous-chapter request won the reader-engine loading slot and the next-chapter request was dropped without another intersection transition. Web Next now follows the current frontend's direction-arming behavior, giving the initial next load priority and rearming each edge from actual scroll direction.
- The semantic parity test sampled the app-shell `main` before lazy page content mounted. It now waits for each page's `main header` before comparing landmarks.
- Full regression correctly exposed one catalog key added after the localization task and two tests left on the pre-rename invalidation API. These were corrected without weakening production contracts.

## Fresh Verification

The following commands completed successfully after the final source changes:

```powershell
npm run check:web-next-arch
npm run check:web-next-contracts
npm run check:web-contracts
npm run check:reader-engine-arch
npm run check:web-next
npm run check:web
npm run check:reader-engine
npm run test:reader-engine
npm run test:regression
npm run build:web
npm run build:web-next
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:e2e:web-next
npm run check:docs
npm run check:lockfile
npm run format:check
git diff --check
```

Recorded results:

- Web Next architecture check: pass.
- Current and next frontend contract checks: pass.
- Reader-engine purity check: pass.
- Current web, Web Next, and reader-engine TypeScript checks: pass.
- Reader-engine package tests: 8 pass, 0 fail.
- Full isolated regression suite: 622 pass, 0 fail, 0 skipped across 182 files.
- Current web production build: pass.
- Web Next production build: pass.
- Web Next CSS contains `.flex`, `.grid`, and `.hidden` utilities.
- Web Next HTML contains no catalog-caused eager preload for `test-source-plugin`, `read-chapter`, or `search-library`.
- Mobile Chromium browser parity gate: 13 pass, 0 fail.
- Documentation, lockfile portability, repository Prettier, and whitespace checks: pass.

Additional race verification during repair:

- Reader URL/scroll browser case under five parallel workers: 5 pass, 0 fail.
- Semantic parity specification repeated three times under six workers: 12 pass, 0 fail.

## Workspace Safety

The following pre-existing user changes remain uncommitted and were not staged by the parity repair:

- `package-lock.json`
- `scripts/check-web-contracts.mjs`
- `scripts/check-web-next-contracts.mjs`
- `scripts/setup-termux.sh`
- `scripts/termux-dev.sh`
- `apps/api-next/storage/`

## Resume Point

Continue only with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-4-cutover-cleanup.md`
- Next task: Subproject 4 Task 1, Add One Full V3 Candidate Verification Command.

Do not cut over storage, rename canonical applications, delete legacy applications, or start a later Subproject 4 task before Task 1 follows its own RED -> GREEN -> REFACTOR cycle and checkpoint discipline.
