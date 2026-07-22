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
npm run dev:api
```

The printed live hash must equal the journal's `sourceManifestSha256`. Then run
`/health`, open a migrated library item and read a chapter before restarting the
web app.

## Preserve failed V3 data

Do not delete `failedCandidatePath`. It is the diagnostic snapshot of the V3
state that failed acceptance. Restrict access to it because it can contain local
credentials or session material. Copy only hashes, timestamps and sanitized log
references into an incident record; never paste database contents or secrets.

On Termux, use the identical Node command:

```sh
node --experimental-sqlite scripts/v3/rollback-storage.mjs --journal .artifacts/v3/cutover-journal.json
```

After rollback, keep the journal, source hash evidence and failed V3 directory
until the incident is closed and a new candidate has passed verification.
