# Novel Tool V3 Subproject 3 Parity Repair Design

Date: 2026-07-22

## Goal

Make `apps/web-next` a behaviorally credible Subproject 3 candidate while preserving its existing FSD boundaries and the reader-engine extraction. The repair covers every confirmed review finding, but does not start Subproject 4, rename applications, delete the legacy frontend, or redesign product flows.

## Constraints

- Keep `apps/web` as the behavioral reference until cutover.
- Keep pages free of HTTP clients and TanStack mutations.
- Keep entity query keys and invalidation entity-owned.
- Keep reader session logic in `features/read-chapter` and `packages/reader-engine`.
- Keep app composition dependent only on public slice exports.
- Add focused regression coverage before each behavior change.
- Preserve unrelated working-tree changes in `package-lock.json` and the existing scripts.

## Repair Strategy

Use a surgical parity repair rather than a frontend rewrite. Each fix restores a known current-web behavior or an explicitly locked Subproject 3 contract, and each architectural adjustment is limited to the boundary required by that behavior.

### 1. Restore the CSS Build Boundary

Add a Web Next PostCSS/Tailwind configuration and an app-owned stylesheet that imports shared tokens before Tailwind base, components, and utilities. `main.tsx` imports the app stylesheet instead of importing shared theme tokens directly. Reuse the current frontend's token-aware Tailwind theme so existing utility classes and responsive variants compile without changing component markup.

The production CSS must contain representative layout and responsive utilities, and the mobile shell must expose only the mobile navigation at a mobile viewport.

### 2. Separate Reader Route Synchronization From Session Navigation

Treat a route-param change as URL-only synchronization when the current reader session already contains the requested chapter and its active index equals the new route index. In that case:

- do not cancel or restart the reader session;
- do not reset scroll restoration state;
- do not scroll the viewport to the top.

Genuine navigation to another requested chapter still starts or repositions the session normally. Put the synchronization predicate in the reader feature so it can be unit tested and reused by the controller and page reset logic.

### 3. Complete Slice-Owned Localization Without Eager Feature Loading

Add the 13 missing literal messages to their owning chapter, task, reader, or page-composition catalogs. Add product status labels to the slices that own the corresponding raw status values. The app catalog remains the composition root, but replaces reflective namespace imports with explicit named catalog imports from public slice exports so Rollup can tree-shake unrelated UI and model exports.

Static regression coverage must fail when a literal translation key has no EN/VI catalog entry. Production `index.html` must not preload unrelated route feature chunks solely because their catalogs are registered.

### 4. Restore the Maintenance Boundary For Backup Restore

Move the generic maintenance context/provider contract to `shared/maintenance`, while leaving provider ordering in `app/providers/AppProviders.tsx`. The backup feature consumes the shared maintenance hook and runs restore through it with `reloadOnSuccess: true`.

Restore flow:

1. Validate file and confirmation state in the feature.
2. Enter the global maintenance boundary.
3. Submit the restore request.
4. Apply returned settings, including `novel-tool-reader`.
5. Reload on success so providers and persisted caches rehydrate from restored state.
6. Release the boundary and retain the current UI on failure.

This restores the blocking overlay and `beforeunload` protection without introducing a feature-to-app import.

### 5. Give Each Search Scope Its Own Pagination Authority

Novel-list pagination remains derived from `useNovels`. Content-search pagination remains derived from `useSearchLibraryFeature`. The library page may store the page number in the shared URL parameter, but it only clamps that value against novel totals while the novel scope is active. The content-search feature clamps against its own result total after content results resolve.

Changing query, scope, sort, or filter continues to reset the URL page to one.

### 6. Narrow Query Persistence To Exact Keys

Persist only these exact query keys:

- novel list queries;
- task summary;
- scheduler status;
- source-plugin list.

Plugin detail, health, and permission queries must not pass the persistence predicate even though they share the list prefix.

### 7. Repair Remaining Behavioral Parity

- Disable credential-secret replacement until the selected strategy has a valid secret payload.
- Centralize reader return-state creation in `shared/navigation`; library and novel-detail navigation preserve the return path and background scroll key.
- Parse backend `<mark>` tags into safe React elements rather than rendering them as literal text.
- Reconcile the task invalidation interface and the locked plan name `invalidateForNovel`.
- Restore the current Vietnamese Sources label used by semantic parity.

### 8. Make Browser Verification An Executed Gate

Update Web Next browser mocks to match the actual V3 endpoints and make copy assertions locale-aware. Retain tests that exercise behavior present in both frontends; remove or rewrite assertions for controls that do not exist in the current reference frontend.

Add assertions for:

- exactly one visible primary navigation at mobile width;
- compiled responsive layout behavior;
- reader bounded-window loading through `/api/novels/:novelId/chapters/:index`;
- URL-only reader synchronization without session or scroll reset;
- key Sources semantics and secret-safe workflows.

Semantic parity continues to compare landmarks, but it is supplemented by visible controls and behavior rather than treated as the sole parity proof.

## Error Handling

- Reader URL synchronization never swallows a genuine loader failure; it only skips redundant initialization.
- Restore failures keep the application mounted, clear the maintenance boundary, and display the existing translated error toast.
- Search clamping waits for the owning query's total and never borrows totals from another scope.
- Missing translations remain detectable in development and regression tests instead of silently passing static checks.

## Verification

The repair is complete only when all of the following pass freshly:

- focused regression tests for each repaired behavior;
- reader-engine tests and purity guard;
- Web Next FSD architecture and HTTP-contract guards;
- literal i18n completeness check;
- current and Web Next TypeScript checks;
- current and Web Next production builds;
- full regression suite;
- all 13 Playwright tests, or a deliberately reduced suite where every removed test is documented as invalid against the current reference frontend;
- `git diff --check` and documentation checks.

## Non-Goals

- No backend changes unless a frontend contract test proves a backend mismatch.
- No visual redesign beyond restoring compiled existing styles.
- No new product capabilities.
- No application rename, cutover, legacy deletion, or Subproject 4 work.
