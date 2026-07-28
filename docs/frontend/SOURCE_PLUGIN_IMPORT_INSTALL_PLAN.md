# Source Plugin Import and Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared file picker, safe multi-layout plugin archive inspection, source-ZIP installation without Studio side effects, and explicit Studio project import without installation side effects.

**Architecture:** The backend owns ZIP inspection and classification. One archive service feeds two explicit use cases: install builds source archives temporarily and installs them, while Studio import persists validated source files and never builds or installs. The web exposes these behaviors through separate FSD features that share only the generic `FilePicker` primitive.

**Tech Stack:** TypeScript, React, TanStack Query, Express, Multer, Zod, JSZip, esbuild, SQLite, Node test runner, Playwright.

## Global Constraints

- Compressed upload limit: 20 MiB; archive entry limit: 500; expanded size limit: 50 MiB.
- Studio source limit: 50 files and 2 MiB of UTF-8 source.
- Importable source paths: `manifest.json`, `src/**`, and `tests/**`; `src/index.ts` is required.
- Never run `npm install`, package scripts, or arbitrary workspace commands.
- Forbid external imports except `@novel-tool/source-plugin-sdk`; allow safe relative imports.
- Install never creates a Studio project. Project import never builds, installs, approves, or enables.
- Successful installation remains `pending-approval`.
- Keep `POST /api/source-reader/plugins/install` backward compatible.
- Confirmation re-uploads the archive and must match the preview checksum.

---

### Task 1: Shared File Picker

**Files:**

- Create: `apps/web/src/shared/ui/forms/FilePicker.tsx`
- Modify: `apps/web/src/shared/ui/index.ts`
- Create: `tests/regression/web-file-picker.test.ts`

**Interfaces:**

- Consumes: shared theme tokens, `cn`, browser `File`, input, and drag/drop events.
- Produces:

```ts
export interface FilePickerProps {
  id?: string;
  value?: File;
  accept?: string;
  disabled?: boolean;
  error?: string;
  chooseLabel: string;
  dropLabel: string;
  emptyLabel: string;
  removeLabel: string;
  onChange(file: File | undefined): void;
}

export function FilePicker(props: FilePickerProps): JSX.Element;
```

- [ ] **Step 1: Write the failing regression test**

```ts
test('FilePicker exposes accessible choose, drop, selected, and remove states', async () => {
  const source = await readFile('apps/web/src/shared/ui/forms/FilePicker.tsx', 'utf8');
  assert.match(source, /type="file"/);
  assert.match(source, /onDrop/);
  assert.match(source, /removeLabel/);
  assert.doesNotMatch(source, /source-plugin|20 \* 1024|\.zip/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/regression/web-file-picker.test.ts`

Expected: FAIL because `FilePicker.tsx` does not exist.

- [ ] **Step 3: Implement the minimal shared control**

Use a visually hidden native single-file input, clickable drop surface, selected file name/size, and remove action. Clear the native input after every selection so selecting the same file again fires `change`. The component performs no plugin validation.

- [ ] **Step 4: Run GREEN and check**

```powershell
node --import tsx --test tests/regression/web-file-picker.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/shared/ui/forms/FilePicker.tsx apps/web/src/shared/ui/index.ts tests/regression/web-file-picker.test.ts
git commit -m "feat(web): add shared file picker"
```

---

### Task 2: Shared Backend Archive Safety

**Files:**

- Create: `apps/api/src/modules/source-reader/infrastructure/plugins/archive/source-plugin-archive-safety.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts`
- Create: `tests/regression/api-source-plugin-archive-safety.test.ts`
- Modify: `tests/regression/source-plugin-sdk-contract.test.ts`

**Interfaces:**

- Consumes: archive bytes and JSZip.
- Produces:

```ts
export const SOURCE_PLUGIN_ARCHIVE_LIMITS = {
  maxArchiveBytes: 20 * 1024 * 1024,
  maxEntries: 500,
  maxUncompressedBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 100
} as const;

export interface SafeSourcePluginArchiveEntry {
  path: string;
  compressedBytes: number;
  uncompressedBytes: number;
  read(): Promise<Uint8Array>;
}

export function loadSafeSourcePluginArchive(
  bytes: Uint8Array
): Promise<{ entries: SafeSourcePluginArchiveEntry[] }>;
```

- [ ] **Step 1: Write failing safety tests**

Create real JSZip inputs and assert rejection for traversal, absolute/drive paths, backslashes, NUL bytes, symlinks, executable permission bits, excessive entries, expanded bytes, and compression ratio. Include one valid archive.

```ts
await assert.rejects(
  () => loadSafeSourcePluginArchive(await archive({ '../manifest.json': '{}' })),
  /unsafe.*path/i
);
```

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/regression/api-source-plugin-archive-safety.test.ts`

Expected: FAIL because the safety module does not exist.

- [ ] **Step 3: Implement archive safety**

Use `unsafeOriginalName`, Unix permissions, and JSZip compressed/uncompressed metadata before materializing content. Keep `checkCRC32: true`. Reject unsafe entries before `entry.async()`.

- [ ] **Step 4: Refactor the package verifier**

Reuse `loadSafeSourcePluginArchive`. Keep package-only checks in the verifier: required files, native addons, executable magic, manifest, complete checksums, signature, and trust level.

- [ ] **Step 5: Run focused compatibility tests**

```powershell
node --import tsx --test tests/regression/api-source-plugin-archive-safety.test.ts tests/regression/source-plugin-sdk-contract.test.ts tests/integration/api-source-reader-external-novelcool.test.ts
```

Expected: PASS without changing `.source-plugin` behavior.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/source-reader/infrastructure/plugins/archive/source-plugin-archive-safety.ts apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts tests/regression/api-source-plugin-archive-safety.test.ts tests/regression/source-plugin-sdk-contract.test.ts
git commit -m "refactor(api): share source plugin archive safety"
```

---

### Task 3: Archive Classification and Source Normalization

**Files:**

- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/modules/source-reader/application/ports/source-plugin-archive-inspector.port.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/plugins/archive/source-plugin-archive.inspector.ts`
- Refactor: `apps/api/src/modules/source-reader/infrastructure/plugins/studio/source-plugin-studio.builder.ts`
- Create: `tests/regression/api-source-plugin-archive-inspector.test.ts`

**Interfaces:**

- Produces shared response types:

```ts
export type SourcePluginArchiveKind = 'built-package' | 'studio-source' | 'npm-workspace';

export interface SourcePluginArchiveProjectConflict {
  id: string;
  name: string;
  version: string;
  revision: number;
}

export interface SourcePluginArchivePreview {
  checksum: string;
  kind: SourcePluginArchiveKind;
  pluginId: string;
  name: string;
  version: string;
  hosts: string[];
  capabilities: string[];
  files: string[];
  ignoredFiles: string[];
  conflicts: SourcePluginArchiveProjectConflict[];
}

export type SourcePluginProjectImportResolution =
  { type: 'create-copy' } | { type: 'update'; projectId: string; expectedRevision: number };
```

- Produces the internal port:

```ts
export interface InspectedSourcePluginArchive {
  preview: Omit<SourcePluginArchivePreview, 'conflicts'>;
  artifact?: { bytes: Uint8Array; fileName: string };
  source?: SourcePluginStudioBuildInput;
}

export interface SourcePluginArchiveInspectorPort {
  inspect(input: {
    bytes: Uint8Array;
    originalName: string;
  }): Promise<InspectedSourcePluginArchive>;
}
```

- [ ] **Step 1: Write failing classification tests**

Cover built package, minimal Studio source, npm workspace, one wrapper directory, two ambiguous roots, unsupported workspace, and extension-independent classification. Assert only `manifest.json`, `src/**`, and `tests/**` enter `source.files`.

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/regression/api-source-plugin-archive-inspector.test.ts`

Expected: FAIL because shared types and inspector are absent.

- [ ] **Step 3: Extract the builder source policy**

Export one helper used by builder and inspector:

```ts
export function assertSourcePluginStudioFiles(files: Record<string, string>): void;
```

It validates paths, file count, UTF-8 text, total bytes, `manifest.json`, and `src/index.ts` without compiling.

- [ ] **Step 4: Implement deterministic classification**

Find candidate roots from required file sets, strip one common wrapper directory, and reject multiple candidates. Built packages go through the existing verifier. Source candidates parse the manifest, build `SourcePluginStudioBuildInput` with `selectors: {}`, and report non-imported workspace files through `ignoredFiles`. Never run npm commands.

- [ ] **Step 5: Run GREEN**

```powershell
node --import tsx --test tests/regression/api-source-plugin-archive-inspector.test.ts tests/integration/api-source-plugin-studio.test.ts tests/regression/source-plugin-sdk-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/shared/src/index.ts apps/api/src/modules/source-reader/application/ports/source-plugin-archive-inspector.port.ts apps/api/src/modules/source-reader/infrastructure/plugins/archive/source-plugin-archive.inspector.ts apps/api/src/modules/source-reader/infrastructure/plugins/studio/source-plugin-studio.builder.ts tests/regression/api-source-plugin-archive-inspector.test.ts
git commit -m "feat(api): inspect source plugin archives"
```

---

### Task 4: Archive Use Cases and Studio Import

**Files:**

- Create: `apps/api/src/modules/source-reader/application/admin/services/source-plugin-archive.service.ts`
- Create: `apps/api/src/modules/source-reader/application/admin/use-cases/plugins/manage-source-plugin-archives.usecase.ts`
- Modify: `apps/api/src/modules/source-reader/application/admin/services/plugin-studio.service.ts`
- Modify: `apps/api/src/modules/source-reader/public/source-reader.api.ts`
- Create: `tests/regression/api-source-plugin-archive-use-cases.test.ts`

**Interfaces:**

- Consumes: inspector, Studio builder, draft repository, installer, authorization, clock, and IDs.
- Produces:

```ts
class SourcePluginArchiveService {
  inspect(input: { bytes: Uint8Array; originalName: string }): Promise<SourcePluginArchivePreview>;
  install(input: {
    bytes: Uint8Array;
    originalName: string;
    expectedChecksum: string;
  }): Promise<Record<string, unknown>>;
  importProject(input: {
    bytes: Uint8Array;
    originalName: string;
    expectedChecksum: string;
    resolution: SourcePluginProjectImportResolution;
  }): Promise<SourcePluginStudioDraft>;
}
```

- [ ] **Step 1: Write failing orchestration tests**

Required behavior:

```text
inspect adds conflicts without mutation
built install: inspect -> install; no build or drafts
source install: inspect -> build -> install; no drafts
checksum mismatch: no side effects
create-copy import: one revision-1 draft; no build/install
update import: expected revision, metadata/files replaced, build metadata cleared
built package import: rejected
```

Use event arrays to assert order:

```ts
assert.deepEqual(events, ['inspect', 'build', 'install']);
```

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/regression/api-source-plugin-archive-use-cases.test.ts`

Expected: FAIL because service and use cases are absent.

- [ ] **Step 3: Add `PluginStudioService.importProject`**

Create a clean draft from inspected metadata/files. On update, require `expectedRevision`, increment once, replace metadata/files, and clear `artifactChecksum` and `builtRevision`.

- [ ] **Step 4: Implement archive service and authorization wrappers**

All operations require `source-admin`. `inspect` joins conflicts from `drafts.list()`. Confirm operations re-inspect and compare checksums before side effects. Public preview must not expose artifact bytes or source contents.

- [ ] **Step 5: Run GREEN and check**

```powershell
node --import tsx --test tests/regression/api-source-plugin-archive-use-cases.test.ts tests/integration/api-source-plugin-studio.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/source-reader/application/admin/services/source-plugin-archive.service.ts apps/api/src/modules/source-reader/application/admin/use-cases/plugins/manage-source-plugin-archives.usecase.ts apps/api/src/modules/source-reader/application/admin/services/plugin-studio.service.ts apps/api/src/modules/source-reader/public/source-reader.api.ts tests/regression/api-source-plugin-archive-use-cases.test.ts
git commit -m "feat(api): add plugin archive use cases"
```

---

### Task 5: HTTP Contracts and Composition

**Files:**

- Modify: `apps/api/src/modules/source-reader/presentation/source-reader.routes.ts`
- Modify: `apps/api/src/modules/source-reader/presentation/source-reader-admin.controller.ts`
- Modify: `apps/api/src/modules/source-reader/presentation/source-reader.schemas.ts`
- Modify: `apps/api/src/modules/source-reader/source-reader.module.ts`
- Create: `tests/integration/api-source-plugin-archive-import.test.ts`
- Modify: `tests/integration/api-source-plugin-studio.test.ts`
- Modify: `tests/regression/web-source-reader-features.test.ts`

**Interfaces:**

```text
POST /api/source-reader/plugins/import/inspect
  multipart: plugin

POST /api/source-reader/plugins/import/install
  multipart: plugin, expectedChecksum

POST /api/source-reader/studio/projects/import
  multipart: plugin, expectedChecksum, resolutionJson
```

- [ ] **Step 1: Write failing production-HTTP integration tests**

Assert inspect is mutation-free, source install creates only a `pending-approval` plugin, source import creates only a Studio project, checksum mismatch is mutation-free, and stale update resolution returns 409.

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test tests/integration/api-source-plugin-archive-import.test.ts`

Expected: FAIL with route-not-found responses.

- [ ] **Step 3: Implement schemas, controller actions, routes, and module wiring**

Parse `resolutionJson` with a strict Zod discriminated union. Reuse the existing 20 MiB/one-file Multer upload. Register explicit import routes before parameterized Studio routes. Return 200 for inspect, 202 for install, and 201 for project import.

- [ ] **Step 4: Preserve legacy direct install**

Keep `/plugins/install` and `InstallSourcePluginUseCase` unchanged. Extend regression assertions so old form-data clients still work.

- [ ] **Step 5: Run GREEN**

```powershell
node --import tsx --test tests/integration/api-source-plugin-archive-import.test.ts tests/integration/api-source-plugin-studio.test.ts tests/regression/web-source-reader-features.test.ts tests/regression/api-architecture-guard.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/source-reader/presentation/source-reader.routes.ts apps/api/src/modules/source-reader/presentation/source-reader-admin.controller.ts apps/api/src/modules/source-reader/presentation/source-reader.schemas.ts apps/api/src/modules/source-reader/source-reader.module.ts tests/integration/api-source-plugin-archive-import.test.ts tests/integration/api-source-plugin-studio.test.ts tests/regression/web-source-reader-features.test.ts
git commit -m "feat(api): expose plugin archive workflows"
```

---

### Task 6: Install Package Preview and Confirmation

**Files:**

- Create: `apps/web/src/entities/source-plugin-archive/api/inspect-source-plugin-archive.ts`
- Create: `apps/web/src/entities/source-plugin-archive/index.ts`
- Modify: `apps/web/src/features/install-source-plugin/api/install-source-plugin.ts`
- Create: `apps/web/src/features/install-source-plugin/model/use-source-plugin-install-flow.ts`
- Modify: `apps/web/src/features/install-source-plugin/ui/InstallSourcePluginForm.tsx`
- Modify: `apps/web/src/features/install-source-plugin/i18n/catalog.ts`
- Modify: `apps/web/src/features/install-source-plugin/index.ts`
- Modify: `tests/regression/web-source-reader-features.test.ts`
- Modify: `tests/regression/web-source-plugin-studio-layout.test.ts`

**Interfaces:**

- The `source-plugin-archive` entity owns the mutation-free inspect client so install and import features do not depend on each other.

```ts
export function inspectSourcePluginArchive(file: File): Promise<SourcePluginArchivePreview>;

export function installSourcePluginArchive(
  file: File,
  expectedChecksum: string
): Promise<SourceReaderPluginInstallResult>;

type SourcePluginInstallStep = 'choose' | 'preview' | 'installing' | 'result';
```

- [ ] **Step 1: Write failing frontend contract tests**

Assert the entity inspect client submits multipart to `/plugins/import/inspect`, confirm submits the original file plus checksum to `/plugins/import/install`, and `InstallSourcePluginForm` imports `FilePicker` instead of rendering `Input type="file"`.

- [ ] **Step 2: Run RED**

```powershell
node --import tsx --test tests/regression/web-source-reader-features.test.ts tests/regression/web-source-plugin-studio-layout.test.ts
```

Expected: FAIL because preview clients and flow are absent.

- [ ] **Step 3: Implement API clients and flow model**

Keep `installSourcePlugin` exported for backward compatibility. The new flow stores the original `File`, preview, action state, and public error. Reset file and preview after success or modal close.

- [ ] **Step 4: Implement preview and explicit confirmation UI**

Show archive kind, name, plugin ID, version, hosts, capabilities, ignored files, and this semantic distinction:

```text
Built packages install directly.
Source archives build temporarily and do not create a Plugin Studio project.
```

Disable confirm until preview succeeds. Installation success continues to invalidate installed-plugin queries and calls `onInstalled`.

- [ ] **Step 5: Run GREEN and check**

```powershell
node --import tsx --test tests/regression/web-source-reader-features.test.ts tests/regression/web-source-plugin-studio-layout.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/entities/source-plugin-archive apps/web/src/features/install-source-plugin tests/regression/web-source-reader-features.test.ts tests/regression/web-source-plugin-studio-layout.test.ts
git commit -m "feat(web): confirm plugin archive installation"
```

---

### Task 7: Explicit Plugin Studio Project Import

**Files:**

- Create: `apps/web/src/features/import-source-plugin-project/api/import-source-plugin-project.ts`
- Create: `apps/web/src/features/import-source-plugin-project/model/use-import-source-plugin-project.ts`
- Create: `apps/web/src/features/import-source-plugin-project/ui/ImportSourcePluginProjectForm.tsx`
- Create: `apps/web/src/features/import-source-plugin-project/i18n/catalog.ts`
- Create: `apps/web/src/features/import-source-plugin-project/index.ts`
- Modify: `apps/web/src/app/i18n/catalog.ts`
- Modify: `apps/web/src/widgets/source-plugin-studio/ui/dashboard/CreateSourcePluginProjectModal.tsx`
- Modify: `tests/regression/web-source-plugin-studio.test.ts`
- Modify: `tests/regression/web-source-plugin-studio-layout.test.ts`

**Interfaces:**

- Consumes the `source-plugin-archive` entity inspect client; it does not import the install feature.

```ts
export function importSourcePluginProject(input: {
  file: File;
  expectedChecksum: string;
  resolution: SourcePluginProjectImportResolution;
}): Promise<SourcePluginProject>;

export function ImportSourcePluginProjectForm(props: {
  onImported(project: SourcePluginProject): void;
}): JSX.Element;
```

- [ ] **Step 1: Write failing Studio import tests**

Assert the feature submits `/studio/projects/import`, invalidates Studio project queries, and imports no build/install feature. Assert New Project exposes separate `Create blank` and `Import project` choices.

- [ ] **Step 2: Run RED**

```powershell
node --import tsx --test tests/regression/web-source-plugin-studio.test.ts tests/regression/web-source-plugin-studio-layout.test.ts
```

Expected: FAIL because the import feature and choice are absent.

- [ ] **Step 3: Implement API, mutation, and preview state**

Reuse `inspectSourcePluginArchive` from `entities/source-plugin-archive`. On success invalidate project list/detail queries and return the imported project to the widget.

- [ ] **Step 4: Implement duplicate resolution**

With no conflicts, use `create-copy`. With conflicts, show a warning and require one explicit choice:

```text
Create a separate Studio project
Update <project name> at revision <revision>
```

Never preselect destructive update. Confirm remains disabled until a resolution is selected.

- [ ] **Step 5: Integrate into New Project modal**

Add a shared segmented/card choice inside `CreateSourcePluginProjectModal`. `Create blank` renders the existing form unchanged. `Import project` renders the import form. Success closes the modal and calls the existing `onCreated`, which opens the project editor. Do not build or install.

- [ ] **Step 6: Run GREEN and check**

```powershell
node --import tsx --test tests/regression/web-source-plugin-studio.test.ts tests/regression/web-source-plugin-studio-layout.test.ts tests/regression/web-source-plugin-studio-workspace.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/features/import-source-plugin-project apps/web/src/app/i18n/catalog.ts apps/web/src/widgets/source-plugin-studio/ui/dashboard/CreateSourcePluginProjectModal.tsx tests/regression/web-source-plugin-studio.test.ts tests/regression/web-source-plugin-studio-layout.test.ts
git commit -m "feat(web): import Plugin Studio projects"
```

---

### Task 8: End-to-End Acceptance and Documentation

**Files:**

- Modify: `tests/e2e/source-plugin-studio.spec.ts`
- Modify: `tests/e2e/source-reader-external-novelcool.spec.ts`
- Modify: `docs/SOURCE_READER.md`
- Modify: `docs/frontend/SOURCE_PLUGIN_IMPORT_INSTALL_DESIGN.md`

**Interfaces:**

- Consumes: completed backend and web flows.
- Produces: executable desktop/mobile acceptance and current operator documentation.

- [ ] **Step 1: Add source-ZIP installation acceptance E2E**

Generate a minimal source ZIP with JSZip, upload through `Install package`, assert preview states temporary build/no Studio project, confirm, and verify a `pending-approval` plugin appears while the project count remains unchanged.

- [ ] **Step 2: Add project-import acceptance E2E**

Upload the same ZIP through `New project -> Import project`, confirm create-copy, verify Studio opens with `manifest.json` and `src/index.ts`, and verify the installed-plugin list remains unchanged.

- [ ] **Step 3: Run focused E2E**

```powershell
npx playwright test tests/e2e/source-plugin-studio.spec.ts tests/e2e/source-reader-external-novelcool.spec.ts
```

Expected: PASS if Tasks 1-7 fully satisfy the acceptance contract. A failure must be investigated as a missing behavior or accessibility contract, not hidden by weakening the test.

- [ ] **Step 4: Make only required accessibility and selector adjustments**

Prefer roles and accessible names. Do not add test-only production attributes when semantic selectors are available.

- [ ] **Step 5: Update operator documentation**

Document:

```text
Install package: validate -> direct install or temporary build -> pending approval; no Studio project.
Import project: validate -> create/update Studio project -> open editor; no build/install.
```

- [ ] **Step 6: Run full verification**

```powershell
npm run check
npm test
npx playwright test tests/e2e/source-plugin-studio.spec.ts tests/e2e/source-reader-external-novelcool.spec.ts
git diff --check
```

Expected: all checks and tests pass with no new warnings.

- [ ] **Step 7: Commit acceptance changes**

```powershell
git add tests/e2e/source-plugin-studio.spec.ts tests/e2e/source-reader-external-novelcool.spec.ts docs/SOURCE_READER.md docs/frontend/SOURCE_PLUGIN_IMPORT_INSTALL_DESIGN.md
git commit -m "test: cover plugin archive workflows"
```
