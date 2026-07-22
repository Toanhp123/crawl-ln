# V3 Storage Rollback

Rollback restores the byte-verified V22 backup after a V3 cutover. Trigger it
when health, library, Reader, Source Reader redaction, scheduler startup or any
acceptance check fails, or when the operator cannot complete acceptance in the
approved window.

## Before rollback

- Stop the V3 API, web preview and workers so SQLite is quiescent.
- Keep `cutover-journal.json`, the V22 backup and the failed V3 directory in
  place. Do not recreate or rename them manually.
- Confirm the journal state is `live-swapped`; the rollback command refuses an
  unprepared or already rolled-back journal.

Inspect the journal:

```powershell
Get-Content .artifacts/v3/cutover-journal.json
```

The recorded `sourceManifestSha256` is the hash that must be restored. The
current live directory must still match `candidateManifestSha256` before the
command moves it aside.

## Restore

```powershell
node --experimental-sqlite scripts/v3/rollback-storage.mjs --journal .artifacts/v3/cutover-journal.json
```

Rollback moves the current V3 live directory to the journal's
`failedCandidatePath`, restores the V22 backup to the live path, re-hashes the
restored directory, and records state `rolled-back`. If a rename fails, the
command attempts to put the directories back in their previous roles before it
returns an error.

Verify the restored bytes and current service:

```powershell
node --input-type=module -e "import { storageManifest } from './scripts/v3/storage-manifest.mjs'; console.log((await storageManifest('.artifacts/v3/live-storage')).sha256)"
Get-Content .artifacts/v3/cutover-journal.json
```

The printed live hash must equal the journal's `sourceManifestSha256`. Do not
start or run canonical V3 with `npm run dev:api` against the restored V22 bytes;
the V3 service does not invoke the V22 importer and can mutate the recovery
database.

Start the built V22 API from the rollback runtime prepared before cutover. Set
`STORAGE_DIR` while still in the current repository so `Resolve-Path` produces
the absolute restored live-storage path:

```powershell
$rollbackRuntime = Join-Path (Get-Location) '.artifacts/v3/rollback-runtime'
$env:STORAGE_DIR = (Resolve-Path '.artifacts/v3/live-storage').Path
Push-Location $rollbackRuntime
try {
  npm run start -w @novel-tool/api-legacy
} finally {
  Pop-Location
}
```

In a second terminal, start the matching built legacy UI preview:

```powershell
$rollbackRuntime = Join-Path (Get-Location) '.artifacts/v3/rollback-runtime'
Push-Location $rollbackRuntime
try {
  npm run preview -w @novel-tool/web-legacy
} finally {
  Pop-Location
}
```

Then run `/health`, open a library item and read a chapter through the legacy UI.

## Preserve failed V3 data

Do not delete `failedCandidatePath`. It is the diagnostic snapshot of the V3
state that failed acceptance. Restrict access to it because it can contain local
credentials or session material. Copy only hashes, timestamps and sanitized log
references into an incident record; never paste database contents or secrets.

On POSIX shells, including Termux, restore and verify with the same Node tools:

```sh
node --experimental-sqlite scripts/v3/rollback-storage.mjs --journal .artifacts/v3/cutover-journal.json
node --input-type=module -e "import { storageManifest } from './scripts/v3/storage-manifest.mjs'; console.log((await storageManifest('.artifacts/v3/live-storage')).sha256)"
ROLLBACK_RUNTIME="$(pwd)/.artifacts/v3/rollback-runtime"
LIVE_STORAGE="$(node -e "console.log(require('node:path').resolve('.artifacts/v3/live-storage'))")"
(cd "$ROLLBACK_RUNTIME" && STORAGE_DIR="$LIVE_STORAGE" npm run start -w @novel-tool/api-legacy)
```

Use a second shell for the matching recovery UI:

```sh
ROLLBACK_RUNTIME="$(pwd)/.artifacts/v3/rollback-runtime"
(cd "$ROLLBACK_RUNTIME" && npm run preview -w @novel-tool/web-legacy)
```

After rollback, keep the journal, source hash evidence, failed V3 directory and
rollback runtime until the incident is closed and the recovery window has ended.
Only after the incident is closed, stop both legacy services and clean up the
registered runtime:

```powershell
git worktree remove --force .artifacts/v3/rollback-runtime
git worktree prune
```

```sh
git worktree remove --force .artifacts/v3/rollback-runtime
git worktree prune
```
