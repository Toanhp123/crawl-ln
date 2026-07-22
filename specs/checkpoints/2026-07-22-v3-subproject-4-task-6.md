# Novel Tool V3 Subproject 4 Task 6 Checkpoint

Date: 2026-07-22

## Status

- Subprojects 1, 2, and 3: complete.
- Subproject 4 Tasks 1 through 3: complete at the previous checkpoint.
- Subproject 4 Task 4, journaled cross-platform storage cutover and rollback: complete.
- Subproject 4 Task 5, end-to-end cutover rehearsal and operator runbooks: complete.
- Subproject 4 Task 6, transactional workspace rename tool: complete.
- Working branch: `feat/v3-cutover-cleanup`.
- Task 4 implementation commit: `06cf5b7` (`feat: add journaled v3 storage cutover`).
- Task 5 implementation commit: `240a94e` (`docs: add v3 cutover and rollback runbooks`).
- Task 6 implementation commit: `a8cd1e2` (`build: add transactional workspace cutover`).
- Subproject 4 Task 7 has not been started.

## Completed Scope

### Task 4

- Added same-parent, same-volume storage cutover through Node filesystem APIs with no platform-specific move command.
- Added repository-root, filesystem-root, path-overlap, cross-volume, missing-evidence, stale-commit, tamper, and concurrent-operation protections.
- Added SQLite `BEGIN EXCLUSIVE; ROLLBACK;` quiescence checks before storage moves.
- Added an atomic journal before the first rename, automatic live-storage restoration after a failed candidate rename, and hash-verified explicit rollback.
- Added `cutover:v3:storage` and `rollback:v3:storage` package commands.

### Task 5

- Added the locked rehearsal sequence: copy, migrate, validate, candidate smoke, cutover, live smoke, rollback, and hash verification.
- Added a normal live-smoke pass before the planned failure injection, so an expected rollback cannot hide a broken default live candidate.
- Added byte/hash restoration evidence and retained the failed V3 storage for diagnosis.
- Added exact Windows, Linux, macOS, and Termux-oriented cutover and rollback runbooks.
- Added `rehearse:v3:cutover` using `--import tsx` and updated the documentation index and operator checklist.

### Task 6

- Added a deterministic map containing 14 exact workspace, architecture-script, contract-script, and Playwright configuration moves.
- Added package-name, script-name, environment, port, architecture-root, Playwright, and test-path rewrites for canonical V3 and retained legacy roles.
- Added current-`HEAD` candidate-manifest validation and tracked-dirty-file refusal with an explicit repeatable allowlist.
- Added a transactional staging directory for rename cycles and wrote the rollback journal before the first filesystem move.
- Added in-memory byte restoration for rewrite failures, reverse-move recovery for rename failures, and persisted backup bytes for explicit rollback.
- Added `--dry-run`, `--manifest`, `--allow-dirty`, `--journal`, `--rollback-journal`, and `--help` command surfaces.
- Preserved the rename tool, its regression test, historical `CHANGELOG.md` entries, and historical `specs/` references during rewrite discovery.
- Included untracked application `.env` files in controlled rewrites while excluding dependencies, builds, artifacts, and storage data.
- Kept both the legacy preview on port `4174` and V3 preview on port `4173` in the canonical Playwright configuration for parity coverage.
- The real repository role switch was not executed; `apps/api`, `apps/web`, `apps/api-next`, and `apps/web-next` retain their pre-Task-7 roles.

## RED -> GREEN Evidence

- Task 4 started with missing cutover and rollback modules. RED cases covered successful swap/rollback, candidate-rename recovery, tampered evidence, and an existing operation lock.
- Task 5 started with a missing rehearsal orchestrator. Tests locked the full operation order, successful default live smoke, delayed failure injection, rollback, and restored source hashes.
- Task 6 started with missing rename modules. Tests locked canonical and legacy package roles, occupied-target refusal, no-write dry runs, rewrite rollback, rename rollback, reverse-rename failure safety, stale manifests, and dirty tracked files.
- The Task 6 fixture suite passed with 7 tests before commit; command help and Prettier checks also exited successfully.

## Fresh Verification

Fresh candidate verification ran after Task 6 implementation commit `a8cd1e20641083f96a2d6d2612fd2745eb05223f`:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node scripts/verify-v3.mjs --report .artifacts/v3/verification-task6.json
node --import tsx --test tests/integration/v3-storage-cutover.test.ts tests/integration/v3-cutover-rehearsal.test.ts tests/regression/v3-workspace-rename.test.ts
node scripts/check-docs.mjs
node scripts/check-lockfile-portability.mjs
git diff --check
```

Recorded result:

- V3 verification graph: 15/15 steps passed.
- Contract suite: 18 pass, 0 fail, 0 skipped.
- Regression suite: 632 pass, 0 fail, 0 skipped.
- Integration suite: 187 pass, 0 fail, 1 skipped.
- Web Next mobile Chromium E2E: 13 pass, 0 fail.
- Focused Task 4-6 suite: 14 pass, 0 fail, 0 skipped.
- Documentation checks: pass.
- Lockfile portability check: pass.
- Whitespace check: pass.
- Verification report commit: `a8cd1e20641083f96a2d6d2612fd2745eb05223f`.
- Verification report window: `2026-07-22T16:31:06.144Z` through `2026-07-22T16:33:43.249Z`.

The full Task 5 rehearsal completed before Task 6 with all 15 verification steps, 18 contract tests, 625 regression tests, 187 passing integration tests with 1 skip, and 13 E2E tests. Its result recorded `sourceManifestRestored: true` and `liveSmokeFailureInjected: true` after a successful default live smoke.

## Protected Working Tree Changes

The following pre-existing user changes remain unstaged and untouched:

- `package-lock.json`
- `scripts/check-web-contracts.mjs`
- `scripts/check-web-next-contracts.mjs`
- `scripts/setup-termux.sh`
- `scripts/termux-dev.sh`
- `apps/api-next/storage/`

The generated `.artifacts/` directory remains ignored and is not part of any commit.

## Resume Point

- Plan: `specs/plans/2026-07-21-v3-subproject-4-cutover-cleanup.md`
- Next task: Subproject 4 Task 7, switch workspace roles while retaining runnable legacy applications.
- Stop at this checkpoint. Do not begin Task 7 until work resumes explicitly.
- The checkpoint commit advances `HEAD` beyond `a8cd1e2`; regenerate verification and candidate-manifest evidence for the checkpoint `HEAD` before Task 7.
- Resolve or explicitly account for the protected working-tree changes before Task 7. The rename command must not rewrite, stage, hide, or absorb them into cutover evidence.
- Do not execute `scripts/v3/rename-workspaces.mjs` against the real repository without a current-commit candidate manifest and the Task 7 pre-cutover safety evidence.
