# Novel Tool V3 Subproject 4 Task 3 Checkpoint

Date: 2026-07-22

## Status

- Subprojects 1, 2, and 3: complete.
- Subproject 4 Task 1, full V3 candidate verification command: complete.
- Subproject 4 Task 2, copy-only V22 migration dry run and integrity report: complete.
- Subproject 4 Task 3, built-candidate smoke and tamper-evident manifest: complete.
- Working branch: `feat/v3-cutover-cleanup`.
- Task 1 implementation commit: `ce808d2` (`build: add v3 candidate verification gate`).
- Task 2 implementation commit: `5d00a5c` (`feat: add v3 migration dry run reports`).
- Task 3 implementation commit: `84516aa` (`test: add v3 candidate smoke evidence`).
- Subproject 4 Task 4 has not been started.

## Completed Scope

### Task 1

- Added `npm run verify:v3` as a direct, non-nested 15-step candidate gate.
- Added atomic optional verification evidence with the commit, timestamps, ordered durations, and `passed: true` only after every step passes.
- Bound verification to one stable `HEAD` and reject a commit change during the run.
- Kept the current `npm run verify` CI gate while installing Chromium once and adding the V3 gate.

### Task 2

- Added copy-only V22 storage migration through a staging directory; the importer never receives the live source database as its target.
- Added source/staging ancestry checks, repository-root deletion protection, explicit replacement of populated staging, source pre/post hashes, streamed file hashing, and sorted storage manifests.
- Added deterministic candidate bytes by normalizing module migration timestamps from the V22 source evidence.
- Added locked, atomic migration reports and a checker that re-hashes staging and rejects false preservation flags, count mismatches, validation errors, or tampering.
- Added a canonical V22 storage fixture command and the `migrate:v3:dry-run` root command.

### Task 3

- Added loopback port reservation, bounded HTTP waiting, direct child-process lifecycle management, Web-before-API shutdown, bounded log capture, and split-chunk secret redaction.
- Added built API-next and Web Next smoke covering health/404 contracts, migrated library and chapter data, SPA routes, real browser Library/Reader/Sources rendering, and Source Reader admin redaction.
- Run the API against a disposable byte-identical clone of staging so startup revalidation or maintenance cannot invalidate migration evidence; the original staging directory is re-hashed after smoke.
- Added exact verification-graph validation, current-commit binding, verification freshness checks, exact migration-report SHA-256 binding, and atomic candidate-manifest writes.
- Added ignored `.artifacts/v3/` evidence and the `smoke:v3:candidate` root command.

## RED -> GREEN Evidence

- Task 1 began with missing runner/script failures. The first full run exposed Vite resolving from the root; a regression then locked Web Next workspace Vite resolution before the gate passed.
- Task 2 began with missing migration utilities. Repeat migration initially produced different database hashes because `platform_module_migrations.applied_at` used wall-clock time; deterministic normalization made repeat evidence identical. Additional RED cases covered finalized importer hashes, failed preservation flags, repository-root safety, and fixture/command wiring.
- Task 3 began with missing manifest, smoke, and process utilities. RED cases covered incomplete verification graphs, unsuccessful migration evidence, exact report-byte hashing, process cleanup, configured master-key preservation, Windows path redaction, disposable runtime storage, and secrets split across output chunks.
- The first real candidate smoke proved that Source Reader startup revalidation can mutate plugin status in a writable database. Smoke now uses a disposable staging clone and successfully revalidates the original staging manifest after shutdown.

## Fresh Verification

Focused verification completed before the Task 3 commit:

```powershell
node --experimental-sqlite --import tsx --test tests/integration/v3-candidate-smoke.test.ts tests/integration/v3-migration-dry-run.test.ts tests/integration/api-next-v22-import.test.ts
npm run check -w @novel-tool/api-next
npm run check -w @novel-tool/web-next
node scripts/check-api-next-architecture.mjs
node scripts/check-web-next-architecture.mjs
```

Recorded focused result: 22 pass, 0 fail; API-next and Web Next TypeScript and architecture checks passed.

Fresh full candidate evidence was then generated against implementation commit `84516aa3a89cd596c109ad0a22bac98ec2f82a86`:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node scripts/verify-v3.mjs --report .artifacts/v3/verification.json
node scripts/v3/migration-report.mjs --check .artifacts/v3/migration-fixture.json --staging .artifacts/v3/staging-fixture
npm run smoke:v3:candidate -- --migration-report .artifacts/v3/migration-fixture.json --verification-report .artifacts/v3/verification.json --output .artifacts/v3/candidate-manifest.json
```

Recorded full result:

- V3 verification graph: 15/15 steps passed.
- Contract suite: 18 pass, 0 fail.
- Regression suite: 625 pass, 0 fail.
- Integration suite: 180 pass, 0 fail, 1 skipped.
- Web Next mobile Chromium E2E: 13 pass, 0 fail.
- Migration validation: IDs/timestamps/search true, all four record-count pairs `1 == 1`, and no validation errors.
- Candidate smoke: `apiHealth`, `httpContracts`, `webRoutes`, `reader`, and `sourceReaderAdmin` are all true.
- Candidate manifest commit: `84516aa3a89cd596c109ad0a22bac98ec2f82a86`.
- Migration report SHA-256: `7167ed73fee33a5bf19f36426cdc1b7b3261c7a20a2327033b0cb0d84dc92863`.
- V22 source database SHA-256: `29d88199c87a7f0b3215ec00d31a9f60f3c5ae4633b8a99e7acb2cd18ea578c3`.
- V3 candidate database SHA-256: `765072f4766274072616d710c3b09a601a2a706e898b5f9c15a2a9384c3bed5d`.
- Candidate logs contain no configured secret names, values, or staging path matches.

## Protected Working Tree Changes

The following pre-existing user changes remain unstaged and untouched:

- `package-lock.json`
- `scripts/check-web-contracts.mjs`
- `scripts/check-web-next-contracts.mjs`
- `scripts/setup-termux.sh`
- `scripts/termux-dev.sh`
- `apps/api-next/storage/`

The generated `.artifacts/` directory is ignored and is not part of any commit.

## Resume Point

- Plan: `specs/plans/2026-07-21-v3-subproject-4-cutover-cleanup.md`
- Next task: Subproject 4 Task 4, journaled cross-platform storage cutover and rollback.
- Stop at this checkpoint. Do not begin Task 4 until work resumes explicitly.
- The committed checkpoint advances `HEAD` beyond `84516aa`; regenerate verification and candidate smoke evidence for the new `HEAD` before any Task 4 operation that requires current-commit evidence.
