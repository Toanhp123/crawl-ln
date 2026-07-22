# V3 Subproject 3 Parity Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair every confirmed Subproject 3 frontend parity defect so `apps/web-next` has compiled responsive styling, stable reader continuity, complete localization, safe maintenance flows, correct pagination/cache behavior, and an executed browser gate.

**Architecture:** Preserve the existing FSD and reader-engine boundaries. Add pure decision helpers where behavior needs direct tests, move only the generic maintenance boundary into `shared`, and keep app code as the composition root through explicit public catalog imports.

**Tech Stack:** React 18, React Router 7, TanStack Query 5, Vite 8, Tailwind CSS 3, TypeScript 5.5, Node test runner with `tsx`, Playwright 1.61.

## Global Constraints

- Keep `apps/web` as the behavioral reference until cutover.
- Keep pages free of HTTP clients and TanStack mutations.
- Keep entity query keys and invalidation entity-owned.
- Keep reader session logic in `features/read-chapter` and `packages/reader-engine`.
- Keep app composition dependent only on public slice exports.
- Add focused regression coverage before each behavior change.
- Preserve unrelated working-tree changes in `package-lock.json` and the existing scripts.
- Do not start Subproject 4, rename applications, delete the legacy frontend, or redesign product flows.

---

### Task 1: Restore the Web Next CSS Build Pipeline

**Files:**
- Create: `apps/web-next/postcss.config.js`
- Create: `apps/web-next/tailwind.config.ts`
- Create: `apps/web-next/src/app/styles/index.css`
- Modify: `apps/web-next/src/main.tsx:7`
- Modify: `apps/web-next/package.json:28`
- Modify: `package-lock.json`
- Create: `tests/regression/web-next-css-pipeline.test.ts`

**Interfaces:**
- Consumes: shared theme CSS variables and the current frontend's canonical Tailwind theme.
- Produces: compiled Tailwind base/components/utilities for every existing Web Next class name.

- [ ] **Step 1: Write the failing CSS pipeline regression test**

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('web-next owns a complete Tailwind/PostCSS entrypoint', async () => {
  const [pkg, postcss, tailwind, css, main] = await Promise.all([
    readFile('apps/web-next/package.json', 'utf8'),
    readFile('apps/web-next/postcss.config.js', 'utf8'),
    readFile('apps/web-next/tailwind.config.ts', 'utf8'),
    readFile('apps/web-next/src/app/styles/index.css', 'utf8'),
    readFile('apps/web-next/src/main.tsx', 'utf8')
  ]);
  for (const dependency of ['tailwindcss', 'postcss', 'autoprefixer']) {
    assert.match(pkg, new RegExp(`"${dependency}"`));
  }
  assert.match(postcss, /tailwindcss/);
  assert.match(postcss, /autoprefixer/);
  assert.match(tailwind, /\.\/src\/\*\*\/\*\.\{ts,tsx\}/);
  assert.match(css, /@import ['"]\.\.\/\.\.\/shared\/theme\/index\.css['"]/);
  assert.match(css, /@tailwind base/);
  assert.match(css, /@tailwind components/);
  assert.match(css, /@tailwind utilities/);
  assert.match(main, /@\/app\/styles\/index\.css/);
  assert.doesNotMatch(main, /@\/shared\/theme\/index\.css/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test tests/regression/web-next-css-pipeline.test.ts`

Expected: FAIL because Web Next has no PostCSS config, Tailwind config, or app stylesheet.

- [ ] **Step 3: Add the canonical CSS pipeline**

Copy `apps/web/postcss.config.js` and `apps/web/tailwind.config.ts` unchanged into `apps/web-next`. Copy `apps/web/src/app/styles/index.css` into `apps/web-next/src/app/styles/index.css`; the relative shared-theme import remains `../../shared/theme/index.css`. Change `main.tsx` to:

```ts
import '@/app/styles/index.css';
```

Install the same dependency ranges used by the current frontend:

```powershell
npm install --save-dev -w @novel-tool/web-next autoprefixer@^10.4.20 postcss@^8.4.45 tailwindcss@^3.4.10
```

- [ ] **Step 4: Verify test and production CSS GREEN**

Run:

```powershell
node --import tsx --test tests/regression/web-next-css-pipeline.test.ts
npm run build:web-next
```

Expected: test passes; build exits 0; the largest Web Next CSS asset contains `.flex`, `.grid`, and `.hidden`.

- [ ] **Step 5: Commit the CSS repair**

```powershell
git add apps/web-next/postcss.config.js apps/web-next/tailwind.config.ts apps/web-next/src/app/styles/index.css apps/web-next/src/main.tsx apps/web-next/package.json package-lock.json tests/regression/web-next-css-pipeline.test.ts
git commit -m "fix: restore web-next css pipeline"
```

### Task 2: Prevent Reader Restarts During URL-Only Synchronization

**Files:**
- Create: `apps/web-next/src/features/read-chapter/lib/reader-route-sync.ts`
- Modify: `apps/web-next/src/features/read-chapter/index.ts`
- Modify: `apps/web-next/src/features/read-chapter/model/use-reader-controller.ts:88`
- Modify: `apps/web-next/src/pages/chapter-reader/ui/ChapterReaderPage.tsx:220`
- Create: `tests/regression/web-next-reader-url-sync.test.ts`

**Interfaces:**
- Consumes: `ReaderSessionSnapshot`-compatible `{ activeIndex, chapters }` state and a requested route index.
- Produces: `isReaderUrlOnlySync(snapshot, requestedIndex): boolean`.

- [ ] **Step 1: Write the failing reader synchronization test**

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isReaderUrlOnlySync } from '../../apps/web-next/src/features/read-chapter/lib/reader-route-sync';

test('reader recognizes URL-only active chapter synchronization', () => {
  const snapshot = { activeIndex: 4, chapters: [{ index: 3 }, { index: 4 }, { index: 5 }] };
  assert.equal(isReaderUrlOnlySync(snapshot, 4), true);
  assert.equal(isReaderUrlOnlySync(snapshot, 5), false);
  assert.equal(isReaderUrlOnlySync({ activeIndex: 4, chapters: [] }, 4), false);
});

test('reader lifecycle does not attach cancellation to route-index effect cleanup', async () => {
  const source = await readFile(
    'apps/web-next/src/features/read-chapter/model/use-reader-controller.ts',
    'utf8'
  );
  assert.match(source, /isReaderUrlOnlySync/);
  assert.match(source, /useEffect\(\(\) => \(\) => session\.cancel\(\), \[session\]\)/);
  assert.doesNotMatch(source, /session\.start[\s\S]*return \(\) => session\.cancel\(\)/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test tests/regression/web-next-reader-url-sync.test.ts`

Expected: FAIL because the helper does not exist and cancellation is still coupled to `initialIndex`.

- [ ] **Step 3: Implement the pure synchronization predicate**

```ts
export interface ReaderRouteSyncSnapshot {
  activeIndex: number;
  chapters: readonly { index: number }[];
}

export function isReaderUrlOnlySync(
  snapshot: ReaderRouteSyncSnapshot,
  requestedIndex: number
): boolean {
  return (
    snapshot.chapters.length > 0 &&
    snapshot.activeIndex === requestedIndex &&
    snapshot.chapters.some((chapter) => chapter.index === requestedIndex)
  );
}
```

Export it from the feature public index.

- [ ] **Step 4: Decouple controller teardown from route changes**

Keep the latest snapshot in a ref. Add one unmount/session-change cleanup effect:

```ts
useEffect(() => () => session.cancel(), [session]);
```

In the initialization effect, return early for `isReaderUrlOnlySync(snapshotRef.current, initialIndex)`. Remove the cleanup returned by that effect. Preserve explicit cancellation for disabled/invalid state.

In `ChapterReaderPage`, guard the reset effect with the same predicate using `controller.activeIndex` and `controller.chapters` before clearing `restored`, `interactive`, or scrolling to zero.

- [ ] **Step 5: Verify RED-to-GREEN and reader regressions**

Run:

```powershell
node --import tsx --test tests/regression/web-next-reader-url-sync.test.ts tests/regression/web-next-reader-pages.test.ts tests/regression/web-next-reader-adapters.test.ts
npm run test:reader-engine
```

Expected: all focused tests pass; reader-engine remains 8/8.

- [ ] **Step 6: Commit the reader repair**

```powershell
git add apps/web-next/src/features/read-chapter apps/web-next/src/pages/chapter-reader/ui/ChapterReaderPage.tsx tests/regression/web-next-reader-url-sync.test.ts
git commit -m "fix: preserve reader session during url sync"
```

### Task 3: Complete Localization and Restore Catalog Tree-Shaking

**Files:**
- Create: `apps/web-next/src/entities/novel/i18n/catalog.ts`
- Create: `apps/web-next/src/entities/chapter/i18n/catalog.ts`
- Create: `apps/web-next/src/entities/task/i18n/catalog.ts`
- Modify: `apps/web-next/src/entities/novel/index.ts`
- Modify: `apps/web-next/src/entities/chapter/index.ts`
- Modify: `apps/web-next/src/entities/task/index.ts`
- Modify: `apps/web-next/src/entities/source-auth-challenge/i18n/catalog.ts`
- Modify: `apps/web-next/src/entities/source-credential/i18n/catalog.ts`
- Modify: `apps/web-next/src/entities/source-network-profile/i18n/catalog.ts`
- Modify: `apps/web-next/src/entities/source-plugin/i18n/catalog.ts`
- Modify: `apps/web-next/src/features/read-chapter/i18n/catalog.ts`
- Modify: `apps/web-next/src/app/i18n/catalog.ts`
- Modify: `apps/web-next/src/app/i18n/app-messages.vi.ts:8`
- Create: `tests/regression/web-next-i18n-completeness.test.ts`

**Interfaces:**
- Consumes: public `*Catalogs` exports from entity and feature slices.
- Produces: complete EN/VI catalogs with no reflective namespace imports and no literal missing keys.

- [ ] **Step 1: Write the failing literal-key and catalog-loading tests**

The test recursively reads `apps/web-next/src`, extracts literal `t('key')` calls and EN/VI catalog keys, and asserts the missing-key list is empty. It also asserts:

```ts
const appCatalog = await readFile('apps/web-next/src/app/i18n/catalog.ts', 'utf8');
assert.doesNotMatch(appCatalog, /import \* as/);
assert.doesNotMatch(appCatalog, /Object\.entries/);
assert.match(appCatalog, /import \{ chapterCatalogs \} from '@\/entities\/chapter'/);
assert.match(appCatalog, /import \{ taskCatalogs \} from '@\/entities\/task'/);
assert.match(appCatalog, /import \{ novelCatalogs \} from '@\/entities\/novel'/);
```

Compare every `common.status.*` key in `apps/web/src/shared/i18n/locales/en.ts` and `vi.ts` with the merged Web Next catalog-key set and require no missing status keys.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test tests/regression/web-next-i18n-completeness.test.ts`

Expected: FAIL with 13 literal missing keys, 42 missing status keys, and reflective imports.

- [ ] **Step 3: Add slice-owned messages**

Use the exact EN/VI wording from `apps/web/src/shared/i18n/locales/en.ts` and `vi.ts`.

- `chapterCatalogs`: all `chapters.*` missing keys plus `common.status.fetched` and `common.status.pending`.
- `taskCatalogs`: `tasks.progress`, `common.status.idle`, `common.status.pausing`, `common.status.paused`, and `common.status.resuming`.
- `novelCatalogs`: `common.status.active`, `common.status.analyzed`, and `common.status.crawling`.
- `readChapterCatalogs`: `reader.bookmarks`, `reader.bookmarksDescription`, and `reader.read`.
- `sourceAuthChallengeCatalogs`: approval/authentication/challenge type and lifecycle statuses.
- `sourceCredentialCatalogs`: basic-auth, bearer-token, cookie-import, custom, and form-login statuses.
- `sourceNetworkProfileCatalogs`: direct, HTTP/HTTPS/SOCKS proxy, VPN gateway, healthy/degraded/offline statuses.
- `sourcePluginCatalogs`: blocked, built-in, disabled, initializing, installed, installed-pending-revalidation, invalid, local-unverified, pending-approval, quarantined, signed, unknown, and API mismatch statuses.

Export the three new entity catalogs through their public `index.ts` files.

- [ ] **Step 4: Replace reflective imports with explicit named public imports**

Rewrite `app/i18n/catalog.ts` so every catalog is imported by its exported name, for example:

```ts
import { chapterCatalogs } from '@/entities/chapter';
import { novelCatalogs } from '@/entities/novel';
import { taskCatalogs } from '@/entities/task';
import { addNovelCatalogs } from '@/features/add-novel';
```

Build `sliceCatalogs` directly from those named values. Remove `catalogFrom`, namespace imports, and `Object.entries`.

Set Vietnamese `nav.sources` to the current-web value `Nguon truyen` using the file's existing UTF-8 Vietnamese spelling, not an ASCII transliteration.

- [ ] **Step 5: Verify localization and bundle behavior**

Run:

```powershell
node --import tsx --test tests/regression/web-next-i18n-completeness.test.ts
npm run check:web-next
npm run build:web-next
```

Expected: no missing literal/status keys; TypeScript and build pass; `apps/web-next/dist/index.html` no longer preloads UI chunks such as `test-source-plugin`, `read-chapter`, or `search-library` solely through catalog registration.

- [ ] **Step 6: Commit localization and catalog repair**

```powershell
git add apps/web-next/src/app/i18n apps/web-next/src/entities apps/web-next/src/features/read-chapter/i18n tests/regression/web-next-i18n-completeness.test.ts
git commit -m "fix: complete web-next localization catalogs"
```

### Task 4: Restore the Global Maintenance Boundary for Backup Restore

**Files:**
- Create: `apps/web-next/src/shared/maintenance/MaintenanceProvider.tsx`
- Create: `apps/web-next/src/shared/maintenance/index.ts`
- Delete: `apps/web-next/src/app/providers/MaintenanceProvider.tsx`
- Modify: `apps/web-next/src/app/providers/AppProviders.tsx:12`
- Modify: `apps/web-next/src/features/backup-library/model/use-backup-library.ts:26`
- Modify: `apps/web-next/src/features/backup-library/lib/settings.ts:1`
- Create: `tests/regression/web-next-backup-maintenance.test.ts`

**Interfaces:**
- Consumes: generic `runMaintenance(label, operation, { reloadOnSuccess })` from shared context.
- Produces: feature-owned restore workflow protected by overlay, `beforeunload`, and reload-on-success.

- [ ] **Step 1: Write the failing maintenance regression test**

Test that `settings.ts` round-trips `novel-tool-reader`, `AppProviders` imports `MaintenanceProvider` from `@/shared/maintenance`, and the backup hook contains `useMaintenanceOperation`, `runMaintenance`, and `reloadOnSuccess: true`.

Use an in-memory `StorageLike` to assert `collectBackupSettings` and `applyBackupSettings` include `novel-tool-reader`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test tests/regression/web-next-backup-maintenance.test.ts`

Expected: FAIL because the reader key and feature maintenance call are absent.

- [ ] **Step 3: Move the generic provider to shared**

Move the existing provider implementation unchanged to `shared/maintenance/MaintenanceProvider.tsx` and export:

```ts
export { MaintenanceProvider, useMaintenanceOperation } from './MaintenanceProvider';
```

Update `AppProviders` to import from `@/shared/maintenance`. This preserves provider order without a feature-to-app dependency.

- [ ] **Step 4: Wrap restore and include reader settings**

Add `'novel-tool-reader'` to `SETTINGS_KEYS`. In `useRestoreLibraryBackup`, wrap the request and setting application:

```ts
mutationFn: (input) =>
  maintenance.runMaintenance(
    t('backup.restoring'),
    async () => {
      const result = await restoreLibraryBackup(input);
      if (result.settings) applyBackupSettings(result.settings);
      return result;
    },
    { reloadOnSuccess: true }
  )
```

Keep the existing translated error toast. Remove duplicate setting application from `onSuccess`.

- [ ] **Step 5: Verify focused tests, architecture, and types**

Run:

```powershell
node --import tsx --test tests/regression/web-next-backup-maintenance.test.ts tests/regression/web-next-settings-data-features.test.ts
npm run check:web-next-arch
npm run check:web-next
```

Expected: all commands pass.

- [ ] **Step 6: Commit the maintenance repair**

```powershell
git add apps/web-next/src/shared/maintenance apps/web-next/src/app/providers/AppProviders.tsx apps/web-next/src/features/backup-library tests/regression/web-next-backup-maintenance.test.ts
git rm apps/web-next/src/app/providers/MaintenanceProvider.tsx
git commit -m "fix: protect web-next backup restore"
```

### Task 5: Separate Novel and Content Search Pagination

**Files:**
- Create: `apps/web-next/src/pages/library/model/library-pagination.ts`
- Create: `apps/web-next/src/features/search-library/model/search-pagination.ts`
- Modify: `apps/web-next/src/pages/library/model/use-library-page.ts:129`
- Modify: `apps/web-next/src/features/search-library/model/use-search-library-feature.ts`
- Create: `tests/regression/web-next-library-pagination.test.ts`

**Interfaces:**
- Produces: `novelPageClampTarget(scope, page, totalPages): number | null` and `searchPageClampTarget(page, totalPages, isPlaceholderData): number | null`.

- [ ] **Step 1: Write failing pure pagination tests**

```ts
assert.equal(novelPageClampTarget('novels', 3, 2), 2);
assert.equal(novelPageClampTarget('content', 3, 1), null);
assert.equal(searchPageClampTarget(3, 2, false), 2);
assert.equal(searchPageClampTarget(3, 2, true), null);
assert.equal(searchPageClampTarget(1, 1, false), null);
```

Also inspect `use-library-page.ts` and require its clamp effect to call `novelPageClampTarget` rather than comparing `page > totalPages` unconditionally.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --import tsx --test tests/regression/web-next-library-pagination.test.ts`

Expected: FAIL because both helpers are absent.

- [ ] **Step 3: Implement scope-owned clamp decisions**

```ts
export function novelPageClampTarget(
  scope: LibrarySearchScope,
  page: number,
  totalPages: number
): number | null {
  return scope === 'novels' && page > totalPages ? totalPages : null;
}
```

```ts
export function searchPageClampTarget(
  page: number,
  totalPages: number,
  isPlaceholderData: boolean
): number | null {
  return !isPlaceholderData && page > totalPages ? totalPages : null;
}
```

Use the first helper in the library page effect. Use the second in `useSearchLibraryFeature` after content results resolve; call the feature's own `updatePage` with the returned target.

- [ ] **Step 4: Verify focused and library/search regressions**

Run:

```powershell
node --import tsx --test tests/regression/web-next-library-pagination.test.ts tests/regression/web-next-library-activity-pages.test.ts tests/regression/web-next-library-task-features.test.ts
npm run check:web-next
```

Expected: all commands pass.

- [ ] **Step 5: Commit pagination repair**

```powershell
git add apps/web-next/src/pages/library/model apps/web-next/src/features/search-library/model tests/regression/web-next-library-pagination.test.ts
git commit -m "fix: separate library search pagination"
```

### Task 6: Restrict Query Persistence to Intended Keys

**Files:**
- Modify: `apps/web-next/src/app/providers/QueryProvider.tsx:6`
- Create: `tests/regression/web-next-query-persistence.test.ts`

**Interfaces:**
- Produces: `shouldPersistAppQueryKey(queryKey: readonly unknown[]): boolean` plus the existing Query wrapper.

- [ ] **Step 1: Write failing exact-key tests**

```ts
assert.equal(shouldPersistAppQueryKey(['novels', 'list', { limit: 12 }]), true);
assert.equal(shouldPersistAppQueryKey(['tasks', 'summary']), true);
assert.equal(shouldPersistAppQueryKey(['scheduler', 'status']), true);
assert.equal(shouldPersistAppQueryKey(['source-reader', 'plugins']), true);
assert.equal(shouldPersistAppQueryKey(['source-reader', 'plugins', 'plugin-1']), false);
assert.equal(
  shouldPersistAppQueryKey(['source-reader', 'plugins', 'plugin-1', 'permissions']),
  false
);
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --import tsx --test tests/regression/web-next-query-persistence.test.ts`

Expected: FAIL because the helper does not exist and detail keys currently pass.

- [ ] **Step 3: Implement exact persistence policy**

```ts
export function shouldPersistAppQueryKey(queryKey: readonly unknown[]): boolean {
  const [root, scope] = queryKey;
  if (root === 'novels' && scope === 'list') return true;
  return (
    queryKey.length === 2 &&
    ((root === 'tasks' && scope === 'summary') ||
      (root === 'scheduler' && scope === 'status') ||
      (root === 'source-reader' && scope === 'plugins'))
  );
}

export function shouldPersistAppQuery(query: Query): boolean {
  return shouldPersistAppQueryKey(query.queryKey);
}
```

- [ ] **Step 4: Verify and commit**

Run: `node --import tsx --test tests/regression/web-next-query-persistence.test.ts tests/regression/web-next-app-shell.test.ts`

Expected: both files pass.

```powershell
git add apps/web-next/src/app/providers/QueryProvider.tsx tests/regression/web-next-query-persistence.test.ts
git commit -m "fix: narrow web-next query persistence"
```

### Task 7: Repair Remaining Interaction Parity

**Files:**
- Modify: `apps/web-next/src/features/manage-source-credential/ui/ReplaceSourceCredentialSecretButton.tsx:6`
- Create: `apps/web-next/src/shared/navigation/reader-navigation-state.ts`
- Create: `apps/web-next/src/shared/navigation/index.ts`
- Modify: `apps/web-next/src/pages/library/model/use-library-page.ts:42`
- Modify: `apps/web-next/src/pages/novel-detail/model/use-novel-detail-page.ts:46`
- Modify: `apps/web-next/src/pages/chapter-reader/model/use-chapter-reader-page.ts`
- Create: `apps/web-next/src/features/search-library/lib/highlighted-snippet.ts`
- Modify: `apps/web-next/src/features/search-library/ui/LibrarySearchPanel.tsx:87`
- Modify: `apps/web-next/src/entities/task/api/task-invalidation.ts`
- Modify: task invalidation consumers under `apps/web-next/src/features/*/model/`
- Create: `tests/regression/web-next-parity-details.test.ts`

**Interfaces:**
- Produces: `createReaderNavigationState(returnPath, backgroundScrollKey)`, `readReaderReturnState(state)`, and `splitHighlightedSnippet(value)`.
- Renames: `TaskInvalidationApi.invalidateNovel` to locked `invalidateForNovel`.

- [ ] **Step 1: Write failing parity-detail tests**

Test these exact behaviors:

```ts
assert.deepEqual(createReaderNavigationState('/library?q=demo', 'scroll-1'), {
  readerReturnPath: '/library?q=demo',
  backgroundScrollKey: 'scroll-1'
});
assert.deepEqual(splitHighlightedSnippet('before <mark>match</mark> after'), [
  { text: 'before ', highlighted: false },
  { text: 'match', highlighted: true },
  { text: ' after', highlighted: false }
]);
```

Static assertions require:

- credential save button uses `disabled={!hasCredentialSecret(...)}`;
- library navigation calls `createReaderNavigationState`;
- search UI maps highlighted parts to `<mark>` elements;
- task invalidation source and consumers contain `invalidateForNovel` and no `invalidateNovel(`.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --import tsx --test tests/regression/web-next-parity-details.test.ts`

Expected: FAIL for all four absent behaviors.

- [ ] **Step 3: Restore credential validation**

Import `hasCredentialSecret` beside `buildCredentialSecret` and set:

```tsx
disabled={!hasCredentialSecret(credential.strategy, secrets)}
```

- [ ] **Step 4: Centralize and use reader return state**

Implement typed creation/reading helpers in `shared/navigation`. Library routes use `location.pathname + location.search` and `location.key`; novel detail uses its current location; chapter reader reads the state through the helper and returns to the recorded path while preserving `backgroundScrollKey`.

- [ ] **Step 5: Safely render highlighted snippets**

Implement a parser that recognizes only `<mark>` and `</mark>` tokens and returns plain text segments with a boolean. Render highlighted segments with the same safe `<mark>` class used by the current frontend; never use `dangerouslySetInnerHTML`.

- [ ] **Step 6: Restore the locked invalidation API name**

Rename the entity interface/object member to `invalidateForNovel` and update all consumers. Do not change query keys or behavior.

- [ ] **Step 7: Verify and commit**

Run:

```powershell
node --import tsx --test tests/regression/web-next-parity-details.test.ts tests/regression/web-next-source-reader-features.test.ts tests/regression/web-next-library-task-features.test.ts
npm run check:web-next
npm run check:web-next-arch
```

Expected: all commands pass.

```powershell
git add apps/web-next/src/features/manage-source-credential apps/web-next/src/shared/navigation apps/web-next/src/pages apps/web-next/src/features/search-library apps/web-next/src/entities/task apps/web-next/src/features tests/regression/web-next-parity-details.test.ts
git commit -m "fix: restore web-next interaction parity"
```

### Task 8: Repair and Execute the Browser Parity Gate

**Files:**
- Modify: `tests/e2e/app-shell.spec.ts`
- Modify: `tests/e2e/button-loading-feedback.spec.ts`
- Modify: `tests/e2e/library-loading-stability.spec.ts`
- Modify: `tests/e2e/source-reader-remediation.spec.ts`
- Modify: `tests/e2e/source-reader-sources-page.spec.ts`
- Modify: `tests/e2e/web-next-reader-parity.spec.ts`
- Modify: `tests/e2e/web-next-semantic-parity.spec.ts`

**Interfaces:**
- Consumes: dual preview servers at ports 4173 and 4174 and installed Edge through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when bundled Chromium is unavailable.
- Produces: an executed, locale-stable 13-test mobile browser gate.

- [ ] **Step 1: Run the current browser suite and preserve RED evidence**

Run:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node node_modules/@playwright/test/cli.js test --config playwright.web-next.config.ts --reporter=line
```

Expected baseline: 4 pass, 9 fail.

- [ ] **Step 2: Correct invalid mocks and locale assumptions**

- Mock chapter content at `**/api/novels/novel-1/chapters/*` and derive the numeric index from the final path segment.
- Set `novel-tool-language=en` in tests that intentionally assert English product copy.
- Locate stable controls by role and semantic purpose when wording differs legitimately.
- Change the library stability test to locate the primary `searchbox`, because Web Next intentionally separates title and content scopes.
- Use exact text for plugin names where switch labels duplicate the same name.

- [ ] **Step 3: Replace nonexistent refresh assertions with shared switch-feedback behavior**

The current reference frontend has no Sources refresh button. Rewrite both loading-feedback cases to exercise the plugin enable switch, which exists in both frontends and exposes `data-feedback-phase`. Keep the same bounding-box stability and success/error phase assertions.

- [ ] **Step 4: Strengthen parity assertions**

Add assertions that only one primary navigation is visible at the Pixel 7 viewport and that the Web Next sidebar is hidden. Keep landmark comparison, and require matching Sources navigation labels after the Vietnamese label repair.

Add a reader test that scrolls until the URL changes and asserts the scroll container does not jump back to zero during URL-only synchronization.

- [ ] **Step 5: Run browser suite to GREEN**

Run the same Playwright command from Step 1.

Expected: 13 passed, 0 failed.

- [ ] **Step 6: Commit browser gate repair**

```powershell
git add tests/e2e
git commit -m "test: execute web-next browser parity gate"
```

### Task 9: Run Full Verification and Write the Repair Checkpoint

**Files:**
- Create: `specs/checkpoints/2026-07-22-v3-subproject-3-parity-repair.md`

**Interfaces:**
- Consumes: all commits from Tasks 1-8.
- Produces: fresh verification evidence and the corrected Subproject 3 resume point.

- [ ] **Step 1: Run focused architecture and contract gates**

```powershell
npm run check:web-next-arch
npm run check:web-next-contracts
npm run check:web-contracts
npm run check:reader-engine-arch
npm run check:web-next
npm run check:web
npm run check:reader-engine
```

Expected: every command exits 0.

- [ ] **Step 2: Run package and regression tests**

```powershell
npm run test:reader-engine
npm run test:regression
```

Expected: reader-engine 8/8 and the full regression suite has zero failures.

- [ ] **Step 3: Run both production builds**

```powershell
npm run build:web
npm run build:web-next
```

Expected: both builds exit 0; Web Next output contains compiled utility CSS and no catalog-caused eager UI preloads.

- [ ] **Step 4: Run the final browser gate**

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:e2e:web-next
```

Expected: 13 passed, 0 failed.

- [ ] **Step 5: Run repository hygiene checks**

```powershell
npm run check:docs
npm run check:lockfile
npm run format:check
git diff --check
git status --short
```

Expected: checks pass; status contains only known pre-existing unrelated changes plus the uncommitted checkpoint file.

- [ ] **Step 6: Write and commit the repair checkpoint**

Record exact commands and counts, note that Subproject 4 remains unstarted, and update the resume point to Subproject 4 Task 1 only after all gates above are green.

```powershell
git add specs/checkpoints/2026-07-22-v3-subproject-3-parity-repair.md
git commit -m "docs: checkpoint v3 frontend parity repair"
```
