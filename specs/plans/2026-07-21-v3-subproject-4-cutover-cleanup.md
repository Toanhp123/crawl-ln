# Novel Tool V3 Subproject 4: Cutover and Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the V3 candidate against migrated schema-version-22 storage, switch canonical workspace roles safely, retain a tested rollback path, and remove the legacy applications only after explicit release acceptance.

**Architecture:** Cutover is evidence-driven and journaled. A read-only source hash, staging migration report, full verification result, and smoke-test manifest are required before storage or workspace roles can change. Storage cutover uses same-volume atomic renames with an automatic restore path; workspace cutover first retains `api-legacy` and `web-legacy`, then deletes them only through an acceptance-gated cleanup command.

**Tech Stack:** Node.js 22.12+, TypeScript 5.5, npm workspaces, SQLite `DatabaseSync`, Node filesystem APIs, Playwright, GitHub Actions, JSON reports with SHA-256 integrity fields.

## Global Constraints

- Complete Subprojects 1, 2, and 3 before starting this plan.
- Current and next APIs must never write the same SQLite database or storage directory concurrently.
- Never run an importer directly against live storage; migration input is copied to staging first.
- Preserve all record IDs, timestamps, chapter content hashes, job outcomes, Source Reader plugin metadata, encrypted credentials/sessions, and scheduler policies.
- A failed migration, validation, smoke test, cutover step, or rollback step leaves the original live storage recoverable.
- Storage cutover and rollback scripts must work on Windows, Linux, macOS, and Termux through Node filesystem APIs; no platform-specific shell move command is used.
- Keep npm workspaces; do not add a mandatory Turborepo dependency.
- Keep `apps/api` and `apps/web` available as the reference implementation until the release-acceptance gate is approved.
- Legacy application removal is forbidden unless the acceptance record matches the current commit and a successful rollback rehearsal.
- Source Plugin SDK capability contract version `1` and sandbox protocol version `1` remain unchanged in release `3.0.0`.
- Do not stage or overwrite unrelated user changes.
- Every production change follows RED -> GREEN -> REFACTOR.

---

## Locked Cutover Artifacts

All scripts in this plan read and write these versioned shapes:

```ts
export interface V3MigrationReport {
  formatVersion: 1;
  mode: 'dry-run' | 'staging';
  source: {
    storagePath: string;
    schemaVersion: 22;
    databaseSha256: string;
    storageManifestSha256: string;
  };
  candidate: {
    storagePath: string;
    schemaVersion: number;
    databaseSha256: string;
    storageManifestSha256: string;
  };
  validation: {
    idsPreserved: boolean;
    timestampsPreserved: boolean;
    recordCounts: Record<string, { source: number; candidate: number }>;
    chapterContentSha256: string;
    taskOutcomeSha256: string;
    sourceReaderMetadataSha256: string;
    schedulerPolicySha256: string;
    searchRebuilt: boolean;
    errors: string[];
  };
  startedAt: string;
  completedAt: string;
}

export interface V3CandidateManifest {
  formatVersion: 1;
  commit: string;
  migrationReportSha256: string;
  verification: { command: 'npm run verify:v3'; passed: true; completedAt: string };
  smoke: {
    apiHealth: true;
    httpContracts: true;
    webRoutes: true;
    reader: true;
    sourceReaderAdmin: true;
  };
}

export interface V3CutoverJournal {
  formatVersion: 1;
  state: 'prepared' | 'live-swapped' | 'rolled-back' | 'accepted';
  livePath: string;
  candidatePath: string;
  backupPath: string;
  failedCandidatePath?: string;
  sourceManifestSha256: string;
  candidateManifestSha256: string;
  createdAt: string;
  updatedAt: string;
}

export interface V3ReleaseAcceptance {
  formatVersion: 1;
  commit: string;
  canonicalCandidateSha256: string;
  approvedBy: string;
  approvedAt: string;
  legacyRemovalApproved: true;
}
```

### Task 1: Add One Full V3 Candidate Verification Command

**Files:**
- Create: `scripts/verify-v3.mjs`
- Create: `tests/regression/v3-verification-runner.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: `verify:v3:backend`, `verify:v3:frontend`, next architecture/contract checks, reader-engine tests, and Playwright next configuration.
- Produces: `npm run verify:v3` as the single pre-cutover candidate gate, optional atomic verification report output, and a CI job that runs it.

- [ ] **Step 1: Write the failing verification-graph test**

```ts
test('v3 verification covers every cutover acceptance surface in order', async () => {
  const { verificationSteps } = await import('../../scripts/verify-v3.mjs');
  assert.deepEqual(verificationSteps.map((step) => step.name), [
    'check:lockfile',
    'prepare:packages',
    'check:docs',
    'check:current-reference',
    'build:current-reference',
    'check:api-next-arch',
    'check:web-next-arch',
    'check:web-next-contracts',
    'check:reader-engine-arch',
    'check:next-types',
    'build:next',
    'contract',
    'regression',
    'integration',
    'e2e:web-next'
  ]);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/v3-verification-runner.test.ts`.

Expected: `scripts/verify-v3.mjs` is missing.

- [ ] **Step 3: Implement a non-nested verification runner**

Use direct child processes and the existing test-suite runner rather than invoking `npm run verify:v3:backend` and `verify:v3:frontend` inside each other. Build the current Web reference before dual-preview browser parity, then build both next workspaces. Export the step list for regression testing and stop on the first non-zero exit. When `--report .artifacts/v3/verification.json` is supplied, atomically write the commit, start/end times, ordered step durations, and `passed: true` only after the last step. Add:

```json
{
  "verify:v3": "node scripts/verify-v3.mjs"
}
```

Update CI to install Chromium once, run `npm run verify:v3`, and retain current `npm run verify` until the workspace switch.

- [ ] **Step 4: Run the complete candidate gate**

```powershell
node --import tsx --test tests/regression/v3-verification-runner.test.ts
node scripts/verify-v3.mjs --report .artifacts/v3/verification.json
```

Expected: current reference checks, all V3 checks/builds/tests, and next mobile Chromium E2E exit 0; the report commit equals `HEAD`.

- [ ] **Step 5: Commit**

```powershell
git add scripts/verify-v3.mjs tests/regression/v3-verification-runner.test.ts .github/workflows/ci.yml package.json
git commit -m "build: add v3 candidate verification gate"
```

### Task 2: Add Copy-Only Migration Dry Runs and Integrity Reports

**Files:**
- Create: `apps/api-next/src/platform/migration/v22-import.cli.ts`
- Create: `scripts/v3/storage-manifest.mjs`
- Create: `scripts/v3/migration-report.mjs`
- Create: `scripts/v3/create-v22-fixture.mjs`
- Create: `scripts/v3/migrate-storage.mjs`
- Create: `tests/integration/v3-migration-dry-run.test.ts`
- Modify: `apps/api-next/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `v22-importer.ts`, `v22-validation.ts`, the schema-version-22 fixture, and Node/SQLite filesystem access.
- Produces: the locked `V3MigrationReport`, `npm run migrate:v3:dry-run`, and a staging directory that is never the source path.

- [ ] **Step 1: Write failing source-immutability and report tests**

```ts
test('migration dry run preserves source bytes and emits complete validation evidence', async () => {
  const fixture = await copyV22Fixture();
  const before = await storageManifest(fixture.source);
  const report = await runMigrationDryRun({ source: fixture.source, staging: fixture.staging });
  const after = await storageManifest(fixture.source);
  assert.deepEqual(after, before);
  assert.equal(report.source.schemaVersion, 22);
  assert.ok(report.candidate.schemaVersion > 22);
  assert.equal(report.validation.idsPreserved, true);
  assert.equal(report.validation.errors.length, 0);
  assert.equal(report.validation.searchRebuilt, true);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --experimental-sqlite --import tsx --test tests/integration/v3-migration-dry-run.test.ts`.

Expected: migration CLI/report utilities are missing.

- [ ] **Step 3: Implement copy, import, validation, and hashing**

`migrate-storage.mjs` must:

1. Resolve source/staging/report paths and reject equal, ancestor, or descendant source/staging pairs.
2. Fail if staging already contains files unless `--replace-staging` is explicitly supplied.
3. Hash the source database and a sorted manifest of all storage files.
4. Recursively copy source storage to staging with timestamps preserved where supported.
5. Invoke the API-next importer only against staging.
6. Run count/ID/timestamp/content/outcome/Source Reader/scheduler/search validation.
7. Hash source again and fail if either source hash changed.
8. Write the report through a temporary file and atomic rename.

`migration-report.mjs --check report.json --staging staging-directory` validates the locked schema, re-hashes staging, and exits non-zero on any mismatch so later cutover tasks never trust stale JSON.

Expose this command:

```json
{
  "migrate:v3:dry-run": "node --experimental-sqlite scripts/v3/migrate-storage.mjs --mode dry-run"
}
```

- [ ] **Step 4: Run fixture dry run twice**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/v3-migration-dry-run.test.ts
node --experimental-sqlite --import tsx scripts/v3/create-v22-fixture.mjs --output .artifacts/v3/v22-fixture
node --experimental-sqlite scripts/v3/migrate-storage.mjs --mode dry-run --source .artifacts/v3/v22-fixture --staging .artifacts/v3/staging-fixture --report .artifacts/v3/migration-fixture.json --replace-staging
```

Expected: source hashes remain identical, candidate schema is newer than 22, validation errors are empty, and the report is deterministic except timestamps/paths.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/platform/migration/v22-import.cli.ts apps/api-next/package.json scripts/v3/storage-manifest.mjs scripts/v3/migration-report.mjs scripts/v3/create-v22-fixture.mjs scripts/v3/migrate-storage.mjs tests/integration/v3-migration-dry-run.test.ts package.json
git commit -m "feat: add v3 migration dry run reports"
```

### Task 3: Create Candidate Smoke Tests and a Tamper-Evident Manifest

**Files:**
- Create: `scripts/v3/process-runner.mjs`
- Create: `scripts/v3/smoke-candidate.mjs`
- Create: `scripts/v3/candidate-manifest.mjs`
- Create: `tests/integration/v3-candidate-smoke.test.ts`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: a successful migration report, built `api-next`/`web-next`, contract harness, and web-next Playwright smoke flows.
- Produces: the locked `V3CandidateManifest` under ignored `.artifacts/v3/` and `npm run smoke:v3:candidate`.

- [ ] **Step 1: Write failing manifest-integrity tests**

```ts
test('candidate manifest binds verification and smoke evidence to one commit', async () => {
  const result = await createCandidateManifest({
    commit: 'abc123',
    migrationReport: reportFixture(),
    verification: passedVerificationFixture(),
    smoke: passedSmokeFixture()
  });
  assert.equal(result.commit, 'abc123');
  assert.match(result.migrationReportSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.smoke.sourceReaderAdmin, true);
});

test('candidate smoke rejects a migration report containing validation errors', async () => {
  await assert.rejects(() => smokeCandidate(reportFixture({ errors: ['count mismatch'] })));
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --experimental-sqlite --import tsx --test tests/integration/v3-candidate-smoke.test.ts`.

Expected: smoke runner and manifest builder are missing.

- [ ] **Step 3: Implement bounded candidate startup and evidence capture**

Start built API-next against staging on a reserved loopback port and built web-next preview on another reserved loopback port. Wait for `/health` with a fixed timeout, run core HTTP contracts, library/reader smoke, Source Reader admin redaction smoke, then stop web before API. Capture stdout/stderr to artifact files without copying secrets into the manifest.

The manifest builder verifies the migration-report SHA-256, `git rev-parse HEAD`, and a freshly completed `npm run verify:v3` evidence file before writing `candidate-manifest.json` atomically.

- [ ] **Step 4: Run smoke against the migrated fixture**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/v3-candidate-smoke.test.ts
node scripts/verify-v3.mjs --report .artifacts/v3/verification.json
npm run smoke:v3:candidate -- --migration-report .artifacts/v3/migration-fixture.json --verification-report .artifacts/v3/verification.json --output .artifacts/v3/candidate-manifest.json
```

Expected: all smoke booleans are true, child processes stop cleanly, and the manifest commit equals `HEAD`.

- [ ] **Step 5: Commit**

```powershell
git add scripts/v3/process-runner.mjs scripts/v3/smoke-candidate.mjs scripts/v3/candidate-manifest.mjs tests/integration/v3-candidate-smoke.test.ts .gitignore package.json
git commit -m "test: add v3 candidate smoke evidence"
```

### Task 4: Implement Cross-Platform Storage Cutover and Rollback

**Files:**
- Create: `scripts/v3/storage-safety.mjs`
- Create: `scripts/v3/cutover-storage.mjs`
- Create: `scripts/v3/rollback-storage.mjs`
- Create: `tests/integration/v3-storage-cutover.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: a valid candidate manifest, source/candidate storage manifests, exclusive SQLite access, and same-parent storage directories.
- Produces: the locked `V3CutoverJournal`, `cutover:v3:storage`, and `rollback:v3:storage`.

- [ ] **Step 1: Write failing swap, failure-recovery, and rollback tests**

```ts
test('cutover atomically swaps candidate storage and rollback restores source bytes', async () => {
  const fixture = await storageCutoverFixture();
  const sourceHash = (await storageManifest(fixture.live)).sha256;
  const journal = await cutoverStorage(fixture.options);
  assert.equal(await readMarker(fixture.live), 'v3');
  await rollbackStorage({ journalPath: journal.path });
  assert.equal((await storageManifest(fixture.live)).sha256, sourceHash);
});

test('failed candidate rename restores live storage before returning an error', async () => {
  const fixture = await storageCutoverFixture({ failCandidateRename: true });
  await assert.rejects(() => cutoverStorage(fixture.options));
  assert.equal(await readMarker(fixture.live), 'v22');
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --experimental-sqlite --import tsx --test tests/integration/v3-storage-cutover.test.ts`.

Expected: cutover/rollback functions are missing.

- [ ] **Step 3: Implement locks, quiescence checks, journal, and atomic renames**

Both commands must use resolved paths and refuse roots, repository root, equal paths, cross-volume swaps, missing manifests, or an existing operation lock. Before moving anything, open the SQLite file and complete `BEGIN EXCLUSIVE; ROLLBACK;`; fail if another process holds it.

Cutover sequence:

```js
await writeJournal({ state: 'prepared', ...pathsAndHashes });
await rename(livePath, backupPath);
try {
  await rename(candidatePath, livePath);
} catch (error) {
  await rename(backupPath, livePath);
  throw error;
}
await writeJournal({ state: 'live-swapped', ...pathsAndHashes });
```

Rollback verifies the journal/source hash, moves the current V3 live directory to `failedCandidatePath`, restores `backupPath` to `livePath`, verifies the original manifest hash, and sets state `rolled-back`.

- [ ] **Step 4: Run cutover tests with real temporary directories**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/v3-storage-cutover.test.ts
```

Expected: the suite exercises exported command functions against same-parent temporary directories; cutover presents V3 storage, rollback restores byte-identical V22 storage, and no partial directory remains at the live path.

- [ ] **Step 5: Commit**

```powershell
git add scripts/v3/storage-safety.mjs scripts/v3/cutover-storage.mjs scripts/v3/rollback-storage.mjs tests/integration/v3-storage-cutover.test.ts package.json
git commit -m "feat: add journaled v3 storage cutover"
```

### Task 5: Add an End-to-End Rehearsal and Operator Runbooks

**Files:**
- Create: `scripts/v3/rehearse-cutover.mjs`
- Create: `tests/integration/v3-cutover-rehearsal.test.ts`
- Create: `docs/V3_CUTOVER.md`
- Create: `docs/V3_ROLLBACK.md`
- Modify: `docs/E2E_TEST_CHECKLIST.md`
- Modify: `docs/README.md`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: migration, candidate smoke, storage cutover, rollback commands, and the V22 fixture.
- Produces: `npm run rehearse:v3:cutover`, an exact operator sequence, and a verified rollback decision tree.

- [ ] **Step 1: Write the failing full-rehearsal test**

```ts
test('rehearsal migrates, verifies, swaps, smokes, rolls back, and restores hashes', async () => {
  const result = await rehearseCutover({ fixture: v22FixturePath(), workDir: temporaryDirectory() });
  assert.deepEqual(result.steps, [
    'copy', 'migrate', 'validate', 'candidate-smoke', 'cutover', 'live-smoke', 'rollback', 'hash-verify'
  ]);
  assert.equal(result.sourceManifestRestored, true);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --experimental-sqlite --import tsx --test tests/integration/v3-cutover-rehearsal.test.ts`.

Expected: rehearsal orchestration and runbooks are missing.

- [ ] **Step 3: Implement the rehearsal and document exact operations**

The rehearsal creates all paths under one temporary parent so rename semantics match production, performs the locked sequence, injects one failed-smoke branch, proves rollback, and writes a compact result JSON.

The cutover runbook must state exact prerequisites, process-stop checks, backup command, migration command, report fields to review, candidate smoke command, cutover command, live smoke checks, acceptance timing, and journal retention. The rollback runbook must state rollback triggers, command, restored-hash check, current API restart, and how to retain failed V3 storage for diagnosis. Include Termux commands using `node --experimental-sqlite`; do not rely on Bash-only filesystem operations.

- [ ] **Step 4: Run rehearsal and documentation checks**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/v3-cutover-rehearsal.test.ts
npm run rehearse:v3:cutover
node scripts/check-docs.mjs
```

Expected: injected failure rolls back, source hashes are restored, and documentation links/terminology pass.

- [ ] **Step 5: Commit**

```powershell
git add scripts/v3/rehearse-cutover.mjs tests/integration/v3-cutover-rehearsal.test.ts docs/V3_CUTOVER.md docs/V3_ROLLBACK.md docs/E2E_TEST_CHECKLIST.md docs/README.md README.md package.json
git commit -m "docs: add v3 cutover and rollback runbooks"
```

### Task 6: Build the Transactional Workspace Rename Tool

**Files:**
- Create: `scripts/v3/workspace-cutover-map.mjs`
- Create: `scripts/v3/rename-workspaces.mjs`
- Create: `tests/regression/v3-workspace-rename.test.ts`

**Interfaces:**
- Consumes: all four runnable workspaces and a clean V3 candidate manifest for `HEAD`.
- Produces: `renameWorkspaces(root, manifest)`, `rollbackWorkspaceRename(root, journal)`, and `--dry-run` output listing every move/rewrite without changing the repository.

- [ ] **Step 1: Write failing rename preflight and rewrite tests**

```ts
test('workspace rename is all-or-nothing and rewrites canonical package roles', async () => {
  const fixture = await workspaceFixture();
  await renameWorkspaces(fixture.root, fixture.manifest);
  assert.equal(await packageName(fixture.root, 'apps/api'), '@novel-tool/api');
  assert.equal(await packageName(fixture.root, 'apps/web'), '@novel-tool/web');
  assert.equal(await packageName(fixture.root, 'apps/api-legacy'), '@novel-tool/api-legacy');
  assert.equal(await packageName(fixture.root, 'apps/web-legacy'), '@novel-tool/web-legacy');
});

test('workspace rename refuses missing source or occupied target paths without moving files', async () => {
  const fixture = await workspaceFixture({ occupiedTarget: 'apps/api-legacy' });
  await assert.rejects(() => renameWorkspaces(fixture.root, fixture.manifest));
  assert.equal(await exists(join(fixture.root, 'apps/api-next')), true);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/v3-workspace-rename.test.ts`.

Expected: rename tool is missing.

- [ ] **Step 3: Implement preflight, moves, and deterministic path rewrites**

The map must contain exact directory, package-name, port, environment-name, script-name, architecture-root, Playwright, and test-string transformations. Preflight verifies all source paths; targets that are not also scheduled source paths must be absent; the candidate manifest commit must equal `HEAD`; and tracked files must be clean except an explicit command-line allowlist. Write a rollback journal before the first rename; on any failed rename/rewrite, reverse completed moves and restore modified files from in-memory bytes.

After the move:

- V3 API uses `PORT` default `3000`, V3 Web uses `5173`, preview uses `4173`, and API proxy uses `3000`.
- Root `dev`, `build`, `check`, `verify`, `dev:api`, and `dev:web` point to V3 canonical packages.
- `dev:legacy`, `dev:api-legacy`, `dev:web-legacy`, `check:legacy`, and `build:legacy` keep old applications runnable when V3 is stopped.
- Test paths that referenced old current internals are rewritten to `apps/api-legacy` or `apps/web-legacy`; V3-specific paths are rewritten from `*-next` to canonical paths.
- Canonical architecture scripts point at V3; legacy scripts remain optional and isolated.

- [ ] **Step 4: Run fixture tests and command help**

```powershell
node --import tsx --test tests/regression/v3-workspace-rename.test.ts
node scripts/v3/rename-workspaces.mjs --help
```

Expected: fixture rollback tests pass and the command documents `--manifest`, `--dry-run`, and rollback-journal behavior.

- [ ] **Step 5: Commit**

```powershell
git add scripts/v3/workspace-cutover-map.mjs scripts/v3/rename-workspaces.mjs tests/regression/v3-workspace-rename.test.ts
git commit -m "build: add transactional workspace cutover"
```

### Task 7: Switch Workspace Roles While Retaining Runnable Legacy Apps

**Files:**
- Move: `apps/api` -> `apps/api-legacy`
- Move: `apps/web` -> `apps/web-legacy`
- Move: `apps/api-next` -> `apps/api`
- Move: `apps/web-next` -> `apps/web`
- Move: `scripts/check-api-architecture.mjs` -> `scripts/check-api-legacy-architecture.mjs`
- Move: `scripts/check-web-architecture.mjs` -> `scripts/check-web-legacy-architecture.mjs`
- Move: `scripts/check-web-contracts.mjs` -> `scripts/check-web-legacy-contracts.mjs`
- Move: `scripts/check-api-next-architecture.mjs` -> `scripts/check-api-architecture.mjs`
- Move: `scripts/check-web-next-architecture.mjs` -> `scripts/check-web-architecture.mjs`
- Move: `scripts/check-web-next-contracts.mjs` -> `scripts/check-web-contracts.mjs`
- Move: `scripts/lib/api-next-architecture.mjs` -> `scripts/lib/api-architecture.mjs`
- Move: `scripts/lib/web-next-architecture.mjs` -> `scripts/lib/web-architecture.mjs`
- Move: `playwright.config.ts` -> `playwright.legacy.config.ts`
- Move: `playwright.web-next.config.ts` -> `playwright.config.ts`
- Modify: moved workspace `package.json`, Vite/environment defaults, architecture-root paths, test path references, root scripts, prepare/build/check scripts, `playwright.config.ts`, and `package-lock.json`

**Interfaces:**
- Consumes: the committed rename tool and a fresh pre-cutover candidate manifest for `HEAD`.
- Produces: canonical packages `@novel-tool/api` and `@novel-tool/web` backed by V3, optional packages `@novel-tool/api-legacy` and `@novel-tool/web-legacy`, and normalized ports `3000/5173/4173` for V3.

- [ ] **Step 1: Run pre-cutover safety assertions**

```powershell
node --import tsx --test tests/regression/v3-workspace-rename.test.ts
node scripts/v3/migration-report.mjs --check .artifacts/v3/migration-production.json --staging .artifacts/v3/staging-production
git status --short
```

Expected: tool tests pass and the production-copy migration report validates the staging manifest. If the report is absent, complete the copy/migration procedure in `docs/V3_CUTOVER.md`. If acknowledged user changes remain, stop before Step 2 and let their owner commit or otherwise resolve them; never stage, rewrite, or hide them inside cutover evidence.

- [ ] **Step 2: Generate fresh committed candidate evidence**

```powershell
node scripts/verify-v3.mjs --report .artifacts/v3/precutover-verification.json
npm run smoke:v3:candidate -- --migration-report .artifacts/v3/migration-production.json --verification-report .artifacts/v3/precutover-verification.json --output .artifacts/v3/precutover-candidate-manifest.json
```

Expected: both artifacts record current `HEAD`, all validation arrays are empty, and smoke booleans are true.

- [ ] **Step 3: Execute the role switch and regenerate workspace metadata**

```powershell
node scripts/v3/rename-workspaces.mjs --dry-run --manifest .artifacts/v3/precutover-candidate-manifest.json
node scripts/v3/rename-workspaces.mjs --manifest .artifacts/v3/precutover-candidate-manifest.json
npm install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org/
```

Expected: dry-run lists the complete mapping without changes; execution then completes all mapped moves/rewrites, the rollback journal reports `completed`, and the lockfile contains canonical plus legacy workspace packages.

- [ ] **Step 4: Verify canonical and retained-legacy workspaces**

```powershell
npm run check
npm run build
npm run check:legacy
npm run build:legacy
node scripts/check-lockfile-portability.mjs
```

Expected: canonical commands run V3, optional legacy commands run the old applications when V3 is stopped, and no `-next` package role remains.

- [ ] **Step 5: Commit**

```powershell
git add -A -- apps scripts tests package.json package-lock.json playwright.config.ts playwright.legacy.config.ts
git commit -m "refactor: switch canonical workspaces to v3"
```

### Task 8: Verify the Canonical Workspaces Against Migrated Staging Storage

**Files:**
- Create: `scripts/v3/verify-canonical-candidate.mjs`
- Create: `tests/integration/v3-canonical-candidate.test.ts`
- Create: `specs/v3-retained-test-coverage.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: canonical V3 workspaces, retained legacy workspaces, migrated staging storage, contract/browser suites, and candidate manifest.
- Produces: `.artifacts/v3/canonical-candidate.json` and a machine-checkable retained-test coverage matrix.

- [ ] **Step 1: Write failing canonical and coverage tests**

```ts
test('retained V3 coverage names every acceptance capability', async () => {
  const matrix = JSON.parse(await readFile('specs/v3-retained-test-coverage.json', 'utf8'));
  assert.deepEqual(Object.keys(matrix).sort(), [
    'api-contract', 'backend-architecture', 'backup', 'browser', 'export', 'frontend-architecture',
    'ingestion', 'library', 'migration', 'reader-engine', 'realtime', 'scheduler', 'search',
    'source-reader'
  ]);
  for (const files of Object.values(matrix) as string[][]) assert.ok(files.length > 0);
});

test('canonical candidate uses V3 packages and migrated storage', async () => {
  const result = await verifyCanonicalCandidate(canonicalFixture());
  assert.equal(result.apiPackage, '@novel-tool/api');
  assert.equal(result.webPackage, '@novel-tool/web');
  assert.equal(result.storageSchemaVersion > 22, true);
  assert.equal(result.passed, true);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --experimental-sqlite --import tsx --test tests/integration/v3-canonical-candidate.test.ts`.

Expected: canonical verifier and coverage matrix are missing.

- [ ] **Step 3: Implement the post-rename acceptance runner**

The coverage matrix lists concrete V3 test files for every acceptance capability and is validated for path existence. The runner starts canonical API/Web against staging, runs `npm run verify`, current canonical Playwright E2E, selected migration/hash validation, Reader offline/bounded rendering, and Source Reader secret-redaction smoke. It also starts each legacy package separately for a health/home-page smoke, proving rollback code remains runnable before deletion, and requires a fresh successful rollback-rehearsal artifact for the same commit.

Write `canonical-candidate.json` with commit, pre-cutover candidate-manifest hash, rollback-rehearsal hash, staging storage-manifest hash, command results, and `passed: true` only when all checks succeed.

- [ ] **Step 4: Run canonical acceptance**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/v3-canonical-candidate.test.ts
npm run rehearse:v3:cutover -- --output .artifacts/v3/rollback-rehearsal.json
npm run verify:v3:canonical -- --storage .artifacts/v3/staging-production --candidate-manifest .artifacts/v3/precutover-candidate-manifest.json --rollback-rehearsal .artifacts/v3/rollback-rehearsal.json --output .artifacts/v3/canonical-candidate.json
```

Expected: canonical V3 checks pass against migrated storage, legacy smoke passes, and the artifact commit equals `HEAD`.

- [ ] **Step 5: Commit**

```powershell
git add scripts/v3/verify-canonical-candidate.mjs tests/integration/v3-canonical-candidate.test.ts specs/v3-retained-test-coverage.json package.json
git commit -m "test: verify canonical v3 cutover candidate"
npm run rehearse:v3:cutover -- --output .artifacts/v3/rollback-rehearsal.json
npm run verify:v3:canonical -- --storage .artifacts/v3/staging-production --candidate-manifest .artifacts/v3/precutover-candidate-manifest.json --rollback-rehearsal .artifacts/v3/rollback-rehearsal.json --output .artifacts/v3/canonical-candidate.json
```

### Task 9: Gate and Remove Legacy Applications Only After Acceptance

**Files:**
- Create: `specs/v3-release-acceptance.schema.json`
- Create: `scripts/v3/legacy-dependency-inventory.mjs`
- Create: `scripts/v3/remove-legacy-apps.mjs`
- Create: `tests/regression/v3-legacy-removal-gate.test.ts`
- Remove after gate: `apps/api-legacy/`
- Remove after gate: `apps/web-legacy/`
- Remove after gate: legacy-only architecture scripts and tests identified by the inventory
- Modify after gate: `package.json`, `package-lock.json`, `scripts/run-test-files.mjs`, `scripts/check-prepared.mjs`, `scripts/build-prepared.mjs`, `scripts/clean.mjs`

**Interfaces:**
- Consumes: locked `V3ReleaseAcceptance`, canonical candidate artifact, rollback rehearsal result, and retained-test coverage matrix.
- Produces: a repository with no legacy application or unretained legacy-only test dependency.

- [ ] **Step 1: Write failing refusal and safe-removal tests**

```ts
test('legacy removal refuses absent, stale, or unapproved acceptance records', async () => {
  const fixture = await legacyRemovalFixture();
  await assert.rejects(() => removeLegacyApps(fixture.root, undefined), /acceptance/i);
  await assert.rejects(
    () => removeLegacyApps(fixture.root, acceptance({ commit: 'different' })),
    /commit/i
  );
  assert.equal(await exists(join(fixture.root, 'apps/api-legacy')), true);
});

test('approved removal keeps every retained coverage file and removes legacy dependencies', async () => {
  const fixture = await legacyRemovalFixture();
  await removeLegacyApps(fixture.root, fixture.acceptance);
  assert.equal(await exists(join(fixture.root, 'apps/api-legacy')), false);
  assert.deepEqual(await findLegacyReferences(fixture.root), []);
  assert.equal(await validateCoverageMatrix(fixture.root), true);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/v3-legacy-removal-gate.test.ts`.

Expected: schema/inventory/removal command are missing.

- [ ] **Step 3: Implement the hard release gate**

Validate the acceptance JSON with these required facts: `legacyRemovalApproved === true`, non-empty `approvedBy`, parseable `approvedAt`, commit equals `HEAD`, `canonicalCandidateSha256` matches the canonical candidate artifact, canonical verification passed, and rollback rehearsal restored the source manifest. Inventory static imports, dynamic imports, path strings, package scripts, docs links, and architecture roots that mention `api-legacy` or `web-legacy`.

Before deletion, prove every legacy-dependent test is excluded from `specs/v3-retained-test-coverage.json` and every retained file exists. Delete only inventory-listed legacy paths, then regenerate the lockfile and fail if any legacy reference remains.

Do not run the removal command until the release operator has created a valid acceptance record from `specs/v3-release-acceptance.schema.json`. If approval is not available, stop here with both legacy workspaces intact and runnable.

- [ ] **Step 4: Execute the gate after explicit acceptance**

```powershell
node --import tsx --test tests/regression/v3-legacy-removal-gate.test.ts
node scripts/v3/remove-legacy-apps.mjs --acceptance .artifacts/v3/release-acceptance.json --canonical-candidate .artifacts/v3/canonical-candidate.json
npm run check
npm run build
npm run test:regression
npm run test:integration
```

Expected: the command refuses invalid evidence; with approved evidence it removes legacy code, retains all V3 coverage, and all canonical gates pass.

- [ ] **Step 5: Commit**

```powershell
git add -A -- apps scripts tests specs/v3-release-acceptance.schema.json package.json package-lock.json
git commit -m "refactor: remove accepted legacy applications"
```

### Task 10: Normalize Release Commands, Termux, Documentation, and Version `3.0.0`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/shared/package.json`
- Modify: `packages/source-plugin-sdk/package.json`
- Modify: `packages/reader-engine/package.json`
- Modify: `scripts/setup-termux.sh`
- Modify: `scripts/termux-dev.sh`
- Modify: `scripts/verify.mjs`
- Modify: `scripts/check-prepared.mjs`
- Modify: `scripts/build-prepared.mjs`
- Modify: `scripts/clean.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/backend/BE_ARCHITECTURE_RULES.md`
- Modify: `docs/frontend/FSD.md`
- Modify: `docs/frontend/FE_BACKEND_CONTRACT_SYNC.md`
- Modify: `docs/E2E_TEST_CHECKLIST.md`
- Modify: `docs/SOURCE_READER.md`
- Modify: `CHANGELOG.md`
- Create: `tests/regression/v3-release-normalization.test.ts`

**Interfaces:**
- Consumes: accepted canonical V3 repository with no legacy apps.
- Produces: release version `3.0.0`, canonical commands with no `-next` naming, Termux support, current architecture docs, and CI release gates.

- [ ] **Step 1: Write failing release-normalization tests**

```ts
test('all publishable workspaces and displayed build metadata use 3.0.0', async () => {
  for (const file of [
    'package.json', 'apps/api/package.json', 'apps/web/package.json',
    'packages/shared/package.json', 'packages/source-plugin-sdk/package.json',
    'packages/reader-engine/package.json'
  ]) assert.equal(JSON.parse(await readFile(file, 'utf8')).version, '3.0.0');
});

test('canonical commands and docs contain no next or legacy workspace role', async () => {
  const source = await readFiles([
    'package.json', 'README.md', 'docs/ARCHITECTURE.md',
    'scripts/check-prepared.mjs', 'scripts/build-prepared.mjs'
  ]);
  assert.doesNotMatch(source, /api-next|web-next|api-legacy|web-legacy/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/v3-release-normalization.test.ts`.

Expected: versions and canonical naming are not fully normalized.

- [ ] **Step 3: Normalize the release surface**

Set package versions to `3.0.0` while retaining Source Plugin SDK capability contract `1` and sandbox protocol `1`. Make `npm run verify` the canonical static/build/regression/integration gate and add `verify:release` for `npm run verify && npm run test:e2e && npm run rehearse:v3:cutover`. Remove obsolete `-next` and legacy command aliases after acceptance.

Update Termux scripts to create `apps/api/storage`, copy canonical env examples, use direct Node/Vite invocation through workspace scripts, and print canonical ports. Update architecture/FSD/contract/Source Reader docs to V3 ownership. Add a `CHANGELOG.md` entry `## 3.0.0 - 2026-07-21` covering modular-monolith boundaries, strict FSD, reader engine, migration/rollback, and unchanged public contracts.

- [ ] **Step 4: Run normalization, docs, Termux, lockfile, and build checks**

```powershell
node --import tsx --test tests/regression/v3-release-normalization.test.ts tests/regression/termux-scripts.test.ts
node scripts/check-docs.mjs
node scripts/check-lockfile-portability.mjs
npm run check
npm run build
```

Expected: version/copy/commands are canonical, Termux tests pass, and no legacy/next role remains in current docs or scripts.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json apps/api/package.json apps/web/package.json packages/shared/package.json packages/source-plugin-sdk/package.json packages/reader-engine/package.json scripts .github/workflows/ci.yml README.md docs CHANGELOG.md tests/regression/v3-release-normalization.test.ts
git commit -m "release: prepare novel tool 3.0.0"
```

### Task 11: Run the Final Release Gate and Preserve Rollback Evidence

**Files:**
- Create: `scripts/v3/release-evidence.mjs`
- Create: `tests/regression/v3-release-evidence.test.ts`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: canonical release, migration report, candidate/canonical manifests, cutover journal, rollback rehearsal, and all verification commands.
- Produces: `.artifacts/v3/release-evidence.json` with hashes for all acceptance artifacts and `npm run verify:release:v3`.

- [ ] **Step 1: Write the failing evidence-completeness test**

```ts
test('release evidence refuses missing or mismatched verification artifacts', async () => {
  await assert.rejects(() => createReleaseEvidence(incompleteArtifacts()), /missing/i);
  const evidence = await createReleaseEvidence(completeArtifacts());
  assert.equal(evidence.version, '3.0.0');
  assert.equal(evidence.commit, await gitHead());
  for (const hash of Object.values(evidence.artifactSha256)) {
    assert.match(hash, /^[a-f0-9]{64}$/);
  }
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/v3-release-evidence.test.ts`.

Expected: release evidence builder is missing.

- [ ] **Step 3: Implement final evidence validation**

Require a valid artifact lineage: the pre-cutover candidate commit is an ancestor of the canonical candidate commit; the legacy-removal acceptance commit equals the canonical candidate commit at the time the gate ran; the final verification and rollback rehearsal equal current `HEAD`; and every referenced SHA-256 matches its file. Include only paths, timestamps, booleans, counts, and SHA-256 hashes; never include credential/session/plugin secret values or raw logs. Add:

```json
{
  "verify:release:v3": "npm run verify && npm run test:e2e && npm run rehearse:v3:cutover && node scripts/v3/release-evidence.mjs"
}
```

- [ ] **Step 4: Run a clean final release verification**

```powershell
npm ci --registry=https://registry.npmjs.org/
npm run verify:release:v3
node scripts/check-docs.mjs
node scripts/check-lockfile-portability.mjs
git diff --check
git status --short
```

Expected: install, architecture, type checks, builds, contract/regression/integration tests, mobile Chromium E2E, migration/cutover/rollback rehearsal, docs, and lockfile checks all exit 0. Release evidence hashes match the current commit and accepted artifacts.

- [ ] **Step 5: Commit**

```powershell
git add scripts/v3/release-evidence.mjs tests/regression/v3-release-evidence.test.ts .gitignore package.json
git commit -m "test: record v3 release evidence"
npm run verify:release:v3
```

## Subproject 4 Completion Gate

Run fresh against a copy of production storage:

```powershell
npm run verify:release:v3
node --experimental-sqlite scripts/v3/migrate-storage.mjs --mode dry-run --source .artifacts/v3/production-copy --staging .artifacts/v3/staging-production --report .artifacts/v3/migration-production.json --replace-staging
node scripts/check-docs.mjs
node scripts/check-lockfile-portability.mjs
git status --short
```

Required result:

- The source production copy has identical pre/post database and storage-manifest hashes.
- Migration validation preserves IDs, timestamps, content, outcomes, Source Reader metadata, credentials/sessions, scheduler policies, and rebuilt search projections.
- Canonical `apps/api` and `apps/web` are V3, use normalized ports/commands, and pass all acceptance gates against migrated staging storage.
- A cutover journal and byte-verified rollback rehearsal exist for the same commit/candidate manifest.
- Legacy applications were removed only after a matching explicit acceptance record; without that record they remain present and runnable.
- `npm run check`, build, contract, regression, integration, mobile browser E2E, Termux checks, documentation checks, and lockfile checks pass.
- Rollback documentation restores the pre-migration snapshot and current-service operation without depending on deleted live storage.
- No unrelated user changes are staged.
