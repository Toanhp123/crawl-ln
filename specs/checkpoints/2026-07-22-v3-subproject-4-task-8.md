# Novel Tool V3 Subproject 4 Task 8 Checkpoint

Date: 2026-07-22

## Status

- Subprojects 1, 2, and 3: complete.
- Subproject 4 Tasks 1 through 6: complete at previous checkpoints.
- Subproject 4 Task 7, switch workspace roles while retaining runnable legacy apps: complete.
- Subproject 4 Task 8, verify canonical workspaces against migrated staging storage: complete.
- Subproject 4 Task 9 has not been started.
- Working branch: `feat/v3-cutover-cleanup`.
- Task 7 implementation commit: `e784f6a` (`refactor: switch canonical workspaces to v3`).
- Task 8 implementation commit: `8a119f6` (`test: verify canonical v3 cutover candidate`).

## Completed Scope

### Task 7

- Switched canonical V3 workspaces to `apps/api` and `apps/web`.
- Retained the previous applications as runnable `apps/api-legacy` and `apps/web-legacy` rollback workspaces.
- Updated canonical package scripts, architecture roots, environment names, Playwright roles, and workspace metadata.
- Kept legacy build/check commands available through `build:legacy` and `check:legacy`.
- Preserved the existing SDK capability contract version `1` and sandbox protocol version `1`.

### Task 8

- Added `scripts/v3/verify-canonical-candidate.mjs` and the root `verify:v3:canonical` command.
- Validated canonical and retained-legacy package names, migrated staging integrity, required tables, applied migrations, and storage manifest stability.
- Required the pre-cutover candidate commit to be an ancestor of the current `HEAD`.
- Required a fresh, same-commit rollback rehearsal with source restoration and hash evidence.
- Ran the canonical verification graph, legacy build, reader-engine tests, and browser E2E before runtime smoke.
- Smoked canonical API/Web against a disposable clone of staging and separately smoked legacy API/Web.
- Added `specs/v3-retained-test-coverage.json` with all 14 retained acceptance capabilities and path-existence validation.
- Updated stale post-rename regression expectations and made legacy Web invoke the hoisted Vite binary through Node on Windows/Termux.
- Removed the Windows `shell: true` npm child-process warning by invoking npm through its CLI path or `cmd.exe` without a nested shell option; added regression coverage for script-name validation and invocation construction.
- No legacy application was removed; Task 9 acceptance gating remains mandatory.

## RED -> GREEN Evidence

- The canonical smoke regression first failed because the post-rename test still expected `30001` while `createCandidateApiEnvironment` correctly returned the supplied `31001`; the assertion was corrected and the focused suite passed 12/12.
- The first full rehearsal reached all non-browser verification steps but stopped because the Playwright browser revision was not installed. Installing the lockfile's Chromium revision made the browser gate pass 13/13.
- Canonical acceptance then exposed Node `DEP0190` from `shell: true`; a new failing invocation test was added, the runner was changed to shell-free npm invocation, and the focused canonical suite passed 4/4 with no `DEP0190` warning.

## Fresh Verification On Task 8 HEAD

The following evidence was regenerated after commit `8a119f62b49decb45a4788e86dbdf522cc5974d7`:

```powershell
npm run rehearse:v3:cutover -- --output .artifacts/v3/rollback-rehearsal.json
npm run verify:v3:canonical -- --storage .artifacts/v3/staging-production --candidate-manifest .artifacts/v3/precutover-candidate-manifest.json --rollback-rehearsal .artifacts/v3/rollback-rehearsal.json --output .artifacts/v3/canonical-candidate.json
```

Recorded result:

- V3 verification graph: 15/15 steps passed.
- Contract suite: 18 pass, 0 fail, 0 skipped.
- Regression suite: 634 pass, 0 fail, 0 skipped across 184 files.
- Integration suite: 193 pass, 0 fail, 1 skipped across 53 files (194 tests).
- Web mobile Chromium E2E: 13 pass, 0 fail.
- Reader-engine suite: 8 pass, 0 fail.
- Legacy API/Web build: pass.
- Canonical runtime smoke: `apiHealth`, `httpContracts`, `webRoutes`, `reader`, and `sourceReaderAdmin` all true.
- Retained legacy runtime smoke: `apiHealth` and `webHome` both true.
- Formatting, canonical check, legacy check, documentation check, lockfile portability, and whitespace checks: pass.

## Evidence Lineage

- Rollback rehearsal: `.artifacts/v3/rollback-rehearsal.json` records commit `8a119f62b49decb45a4788e86dbdf522cc5974d7`, `sourceManifestRestored: true`, and `rollbackTriggered: true`.
- Rehearsal source manifest SHA-256: `b11320744af869effa562597f8d97fc4d662698c81bf04f23712f2a2c79f8b24`.
- Rehearsal candidate manifest SHA-256: `f11e8797a6255992e8292b2b80977e04afe603b8c17337a9bca41e0bc1ace68b`.
- Canonical candidate: `.artifacts/v3/canonical-candidate.json` records the same commit and `passed: true`.
- Pre-cutover candidate commit: `9ee2be2ca0b56b89076ad44f5f3906c5a4254b47` (ancestor of Task 8 HEAD).
- Pre-cutover candidate manifest SHA-256: `a7bb245fcc542f4045293e740853726d9dd6cb095131a98c2f5869a21ac73cfe`.
- Rollback rehearsal artifact SHA-256 recorded by canonical acceptance: `3577f4c741412cd0f274d933fcdf0b1ab19ffbe44b8357da6d4a70634b9286c8`.
- Staging storage manifest SHA-256: `c56541d4d812b385eddc5bdfd08de5fa43c28e027b67c454d2b9c3d590f6581b`.
- Retained coverage matrix SHA-256: `c388fe347706bd84b2f545c98dfb64223df1efb95fb9efca797c12d71a1eb731`.
- All `.artifacts/v3` files and runtime logs remain ignored and are not part of this commit.

## Protected Working Tree Changes

The following pre-existing user changes remain unstaged and untouched:

- `scripts/check-web-contracts.mjs` (mode change only)
- `scripts/check-web-legacy-contracts.mjs` (mode change only)
- `scripts/setup-termux.sh` (mode change only)
- `scripts/termux-dev.sh` (mode change only)

No storage database, `.env`, recovery copy, or generated artifact was staged.

## Resume Point

- Plan: `specs/plans/2026-07-21-v3-subproject-4-cutover-cleanup.md`
- Next task: Subproject 4 Task 9, gate and remove legacy applications only after explicit release acceptance.
- Stop at this checkpoint. Do not begin Task 9 until work resumes explicitly.
- Keep `apps/api-legacy` and `apps/web-legacy` runnable until a valid release-acceptance record matches the current commit and rollback evidence.
- Before Task 9, regenerate any evidence that becomes stale after this checkpoint commit and resolve the protected working-tree mode changes without staging or hiding them.
