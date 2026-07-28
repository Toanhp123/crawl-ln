# Source Plugin Import and Install Design

## Goal

Make package installation and Plugin Studio project import two explicit flows while sharing one safe archive inspector and one shared file-picker component.

## Product Rules

- `Install package` is installation-focused. It never creates a Studio project.
- `New project -> Import project` is project-focused. It never builds, installs, approves, or enables a plugin.
- Both flows accept `.source-plugin` and `.zip` files. The extension is only a browser hint; the backend identifies the archive from its contents.
- A successful install remains `pending-approval`. Approval and enable remain explicit operator actions.
- A ZIP that is not a supported plugin artifact or source workspace is rejected with a precise validation result.
- A duplicate `pluginId` produces a warning. The user must choose whether to update an existing Studio project or create a new project copy; no overwrite is implicit.

## Architecture

The backend owns archive inspection because ZIP safety, manifest validation, and build policy must not be duplicated in the browser.

```text
shared/ui/FilePicker
  -> install-source-plugin feature (inspect -> confirm -> install)
  -> source-plugin-studio dashboard (import -> confirm -> create project)

archive inspector
  -> built artifact verifier
  -> Studio source normalizer and validator
  -> Studio builder (install flow only)
  -> plugin installer
```

The existing package verifier remains the final gate for built artifacts. The existing Studio builder remains the only compiler. New code only adds an archive inspection/normalization boundary and orchestration use cases.

## Shared File Picker

Add a shared `FilePicker` control under `apps/web/src/shared/ui` with one responsibility: selecting a single local file.

The control supports click-to-select and drag/drop, exposes the selected file name and size, forwards `accept`, supports disabled/error states, and never performs domain validation. Feature slices provide limits, accepted labels, and validation messages.

## Archive Classification

The inspector receives the uploaded bytes and returns a preview without mutating application state.

### Safety checks

- Maximum compressed input: 20 MiB.
- Maximum entries: 500.
- Maximum expanded bytes: 50 MiB.
- Reject absolute paths, path traversal, NUL bytes, backslashes, symlinks, executable permission bits, native addons, and executable binary magic.
- Enforce a bounded compression ratio before materializing entries.
- Normalize a single wrapper directory such as `plugin-main/` before classification.

### Supported kinds

- `built-package`: contains the required artifact files (`manifest.json`, `dist/index.js`, `checksums.json`) and can be passed to the existing package verifier.
- `studio-source`: contains `manifest.json` and `src/index.ts`, with optional `tests/` and supported source files.
- `npm-workspace`: contains a `package.json` plus a supported Studio source layout. `package.json` is metadata only; the server never runs npm scripts or installs dependencies.
- `unsupported`: every other layout, including ambiguous archives with multiple candidate plugin roots.

The preview includes kind, manifest metadata, normalized source files, ignored files, archive checksum, and duplicate project warnings. Source imports must still satisfy the Studio builder policy: only SDK imports and safe relative imports are allowed.

## Install Package Flow

1. User selects an archive with `FilePicker`.
2. Frontend calls `POST /api/source-reader/plugins/import/inspect`.
3. UI shows preview, warnings, and the exact action that will happen.
4. User confirms installation. Frontend uploads the same file with the preview checksum.
5. Backend re-inspects and rejects if the checksum changed.
6. For `built-package`, backend verifies and installs directly.
7. For `studio-source` or `npm-workspace`, backend builds in a temporary build context, verifies the generated artifact, and installs it without creating a draft project.
8. Result reports the installed plugin/version and `pending-approval` status.

Build or install failure leaves no Studio project. Temporary build output is removed; the user receives a public error and request ID.

## Import Project Flow

1. User selects `New project -> Import project`.
2. Frontend calls the same inspect endpoint and displays preview plus duplicate warnings.
3. User confirms `create copy` or selects an existing project and confirms `update`.
4. Frontend uploads the same file with the preview checksum and selected duplicate action.
5. Backend re-inspects, validates source files, and creates or updates the Studio draft only.
6. Frontend opens the returned project in Studio.
7. No build, package install, permission approval, or enable action occurs automatically.

If import validation fails, no draft mutation occurs. If an update conflicts with a newer revision, the existing Studio conflict flow is used.

## Backend Interfaces

Add additive application use cases and keep the existing install/build services behind ports:

- `InspectSourcePluginArchiveUseCase` returns `SourcePluginArchivePreview`.
- `InstallSourcePluginArchiveUseCase` accepts bytes, original name, and expected preview checksum; it delegates built artifacts to the verifier and source archives to the Studio builder plus installer.
- `ImportSourcePluginProjectUseCase` accepts bytes, original name, expected preview checksum, and duplicate action; it writes only a validated Studio draft.

The HTTP layer exposes inspect/install/import endpoints under the source-reader admin routes. The confirm endpoints re-run inspection and compare the expected checksum, so the preview cannot be bypassed or applied to a different file.

## Error Handling

- Inspection errors identify the rejected archive rule and do not mutate state.
- Ambiguous roots require the user to repack the archive; the server never guesses.
- Duplicate plugin IDs are warnings until the user explicitly chooses an update or copy action.
- Source build errors are returned only by the install flow; import remains a validation-only operation.
- No endpoint approves or enables a plugin as a side effect.

## Testing

- Shared `FilePicker` render and interaction tests cover selected file, drag/drop, disabled, and error states.
- Archive inspector tests cover built artifact, Studio source, npm workspace, wrapper directories, ambiguous roots, traversal, symlink, executable, ZIP bomb, size, checksum, and unsupported layouts.
- Install use-case tests prove source archives build temporarily and never create drafts; built artifacts bypass the builder; all installs end in `pending-approval`.
- Import use-case tests prove validation-only behavior, duplicate warning/update/copy decisions, revision conflicts, and no install side effects.
- Web regression tests cover both modal flows and preview confirmation.
- E2E covers install-package and import-project journeys on desktop and mobile.
