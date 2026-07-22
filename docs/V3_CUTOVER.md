# V3 Storage Cutover

This runbook moves a validated V3 storage directory into the live role. It is an
operator procedure, not a migration shortcut. Keep the V22 source and its hashes
available until the release acceptance record is signed.

## Preconditions

1. Stop the current API, web preview, scheduler and any background worker. No
   process may hold the live SQLite file.
2. Work from a clean, committed candidate. The candidate manifest commit must
   equal `git rev-parse HEAD`; do not use an artifact from another commit.
3. Put live, candidate, backup and failed-candidate directories under one parent
   directory on one volume. The cutover tool refuses roots, repository root,
   nested paths, cross-volume paths and symbolic-link storage directories.
4. Preserve a copy of the V22 source outside the repository. Never point an
   importer at the only live copy.

Check the repository and stop conditions:

```powershell
git status --short
git rev-parse HEAD
node --experimental-sqlite scripts/v3/migration-report.mjs --check .artifacts/v3/migration-production.json --staging .artifacts/v3/staging-production
```

The report must show empty validation errors, equal record counts, preserved IDs
and timestamps, rebuilt search, and hashes that match the staging directory.

## Prepare and validate

Create a byte-preserving source copy and migrate into a sibling staging directory:

```powershell
node --experimental-sqlite scripts/v3/migrate-storage.mjs --mode staging --source .artifacts/v3/production-copy --staging .artifacts/v3/staging-production --report .artifacts/v3/migration-production.json --replace-staging
node scripts/verify-v3.mjs --report .artifacts/v3/precutover-verification.json
npm run smoke:v3:candidate -- --migration-report .artifacts/v3/migration-production.json --verification-report .artifacts/v3/precutover-verification.json --output .artifacts/v3/precutover-candidate-manifest.json
node --experimental-sqlite scripts/v3/migration-report.mjs --check .artifacts/v3/migration-production.json --staging .artifacts/v3/staging-production
```

Review these fields before swapping: source and candidate database hashes,
storage-manifest hashes, `idsPreserved`, `timestampsPreserved`, every record-count
pair, chapter/task/Source Reader/scheduler hashes, `searchRebuilt`, and an empty
`validation.errors` array. Check that every smoke flag in the candidate manifest
is `true` and that its commit is the current `HEAD`.

## Prepare rollback runtime

Before removing either legacy workspace or swapping live storage, prepare a
detached runtime from the commit recorded by the accepted canonical candidate.
That commit is the reviewed V22-compatible recovery application; the current V3
checkout is not a substitute. Keep the runtime under the ignored artifact root
so it is available even after legacy deletion.

PowerShell:

```powershell
$canonical = Get-Content -Raw .artifacts/v3/canonical-candidate.json | ConvertFrom-Json
$rollbackRuntime = Join-Path (Get-Location) '.artifacts/v3/rollback-runtime'
if (Test-Path $rollbackRuntime) { throw "Rollback runtime already exists: $rollbackRuntime" }
git cat-file -e "$($canonical.commit):apps/api-legacy/package.json"
git cat-file -e "$($canonical.commit):apps/web-legacy/package.json"
git worktree add --detach $rollbackRuntime $canonical.commit
Push-Location $rollbackRuntime
try {
  npm ci --ignore-scripts
  npm run build:legacy
} finally {
  Pop-Location
}
```

POSIX shells, including Termux:

```sh
ROLLBACK_RUNTIME="$(pwd)/.artifacts/v3/rollback-runtime"
ROLLBACK_COMMIT="$(node --input-type=module -e "import { readFile } from 'node:fs/promises'; const value = JSON.parse(await readFile('.artifacts/v3/canonical-candidate.json', 'utf8')); process.stdout.write(value.commit)")"
test ! -e "$ROLLBACK_RUNTIME"
git cat-file -e "$ROLLBACK_COMMIT:apps/api-legacy/package.json"
git cat-file -e "$ROLLBACK_COMMIT:apps/web-legacy/package.json"
git worktree add --detach "$ROLLBACK_RUNTIME" "$ROLLBACK_COMMIT"
(cd "$ROLLBACK_RUNTIME" && npm ci --ignore-scripts && npm run build:legacy)
```

Do not continue unless both legacy builds succeed. Keep the registered worktree,
its `node_modules`, and its built outputs unchanged through the full acceptance
and recovery window.

## Swap

Keep all four directories as siblings. The command writes a prepared journal,
tests SQLite exclusive access, renames live to backup, then renames candidate to
live. A failed second rename automatically restores live from backup.

```powershell
node --experimental-sqlite scripts/v3/cutover-storage.mjs --live .artifacts/v3/live-storage --candidate .artifacts/v3/staging-production --backup .artifacts/v3/backup-v22 --failed-candidate .artifacts/v3/failed-v3 --journal .artifacts/v3/cutover-journal.json --manifest .artifacts/v3/precutover-candidate-manifest.json --migration-report .artifacts/v3/migration-production.json
```

Do not delete the backup or journal after a successful swap. The journal state
must be `live-swapped`, and its source/candidate manifest hashes must match the
reviewed reports.

Perform live smoke checks immediately: `/health`, a migrated library item, one
chapter in Reader, `/sources`, and a redacted Source Reader administration view.
Keep the acceptance window open until these checks and the operator approval are
complete. Only then may a release process mark the journal `accepted`.

## Termux

Use the same Node commands from the repository directory; do not use `mv`,
`cp -r`, or other shell-specific replacement operations:

```sh
node --experimental-sqlite scripts/v3/migrate-storage.mjs --mode staging --source .artifacts/v3/production-copy --staging .artifacts/v3/staging-production --report .artifacts/v3/migration-production.json --replace-staging
node scripts/verify-v3.mjs --report .artifacts/v3/precutover-verification.json
npm run smoke:v3:candidate -- --migration-report .artifacts/v3/migration-production.json --verification-report .artifacts/v3/precutover-verification.json --output .artifacts/v3/precutover-candidate-manifest.json
node --experimental-sqlite scripts/v3/cutover-storage.mjs --live .artifacts/v3/live-storage --candidate .artifacts/v3/staging-production --backup .artifacts/v3/backup-v22 --failed-candidate .artifacts/v3/failed-v3 --journal .artifacts/v3/cutover-journal.json --manifest .artifacts/v3/precutover-candidate-manifest.json --migration-report .artifacts/v3/migration-production.json
```

See [V3 rollback](V3_ROLLBACK.md) if any prerequisite, smoke check or acceptance
condition fails.
