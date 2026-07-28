# Web API Error Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every frontend error surface the backend's human-readable `message` while keeping error code, request ID, and details available only through DevTools and application logic.

**Architecture:** Keep HTTP parsing in `shared/api`, but move all user-facing error selection through the existing `shared/i18n` `errorMessage` boundary. `interpretAppError` will preserve meaningful API messages and only localize generic network/fallback cases. Feature slices will stop formatting technical API metadata themselves.

**Tech Stack:** React, TypeScript, TanStack Query, Node test runner, `tsx`.

## Global Constraints

- Never render `ApiError.code`, `ApiError.requestId`, or `ApiError.details` in user-facing text.
- Preserve `ApiError.status`, `ApiError.code`, `ApiError.details`, and `ApiError.requestId` for control flow, logging, and DevTools.
- Use the backend `ApiError.message` unchanged when it is non-empty.
- Keep feature-specific error titles and actions unchanged.
- The repository docs check may fail because the user is intentionally deferring docs cleanup; do not modify unrelated docs.

## File Map

- Modify: `apps/web/src/app/i18n/error-catalog.ts` — select a meaningful API message before generic catalog entries.
- Modify: `apps/web/src/shared/api/errors.ts` — remove the technical-code presentation helper after feature migration; retain transport parsing and `getErrorMessage`.
- Modify: `apps/web/src/shared/api/index.ts` — stop exporting the removed presentation helper.
- Modify: the source-plugin feature model/UI files currently importing `getPublicErrorDescription` — consume `useI18n().errorMessage` instead.
- Modify: `tests/regression/web-source-reader-features.test.ts` — update the architecture/security contract to require the shared i18n error boundary and verify diagnostic metadata stays hidden.
- Modify: `tests/regression/web-app-shell.test.ts` — add direct interpreter regression coverage.

### Task 1: Preserve Backend Messages in the Global Error Interpreter

**Files:**

- Modify: `apps/web/src/app/i18n/error-catalog.ts`
- Test: `tests/regression/web-app-shell.test.ts`

**Interfaces:**

- Consumes: `ApiError.message`, `ApiError.code`, and `ApiError.requestId`.
- Produces: `interpretAppError(error: unknown): string | undefined` that returns a non-empty API message unchanged and never includes diagnostic fields.

- [ ] **Step 1: Write the failing test**

Add a test beside the existing i18n/provider composition tests:

```ts
test('error interpreter prefers backend messages and hides diagnostics', async () => {
  const { ApiError } = await import('../../apps/web/src/shared/api/errors.ts');
  const { interpretAppError } = await import('../../apps/web/src/app/i18n/error-catalog.ts');
  const error = new ApiError('Plugin is used by an active crawl task.', {
    status: 409,
    code: 'SOURCE_PLUGIN_IN_USE',
    details: { jobId: 'job-1', secret: 'do-not-render' },
    requestId: 'request-1'
  });

  assert.equal(interpretAppError(error), 'Plugin is used by an active crawl task.');
  assert.doesNotMatch(
    interpretAppError(error) ?? '',
    /SOURCE_PLUGIN_IN_USE|request-1|job-1|secret/
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx tsx --test tests/regression/web-app-shell.test.ts`

Expected: FAIL because the current interpreter replaces the backend message with a localized conflict message and appends the request ID.

- [ ] **Step 3: Implement the minimal interpreter change**

In `error-catalog.ts`, return `error.message.trim()` for an `ApiError` when non-empty. If the API message is empty, fall through to the existing code-to-catalog mapping. Keep network detection for non-API errors. Do not include `requestId` in the returned string.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx tsx --test tests/regression/web-app-shell.test.ts`

Expected: PASS, including the new message/diagnostic regression.

- [ ] **Step 5: Commit the interpreter change**

```bash
git add apps/web/src/app/i18n/error-catalog.ts tests/regression/web-app-shell.test.ts
git commit -m "fix(web): prefer backend error messages"
```

### Task 2: Remove Technical Error Formatting from Feature Slices

**Files:**

- Modify: `apps/web/src/shared/api/errors.ts`
- Modify: `apps/web/src/shared/api/index.ts`
- Modify: `apps/web/src/features/test-source-plugin/model/use-test-source-plugin.ts`
- Modify: `apps/web/src/features/install-source-plugin/model/use-source-plugin-install-flow.ts`
- Modify: `apps/web/src/features/install-source-plugin/model/use-install-source-plugin.ts`
- Modify: `apps/web/src/features/inspect-source-url/ui/InspectSourceUrl.tsx`
- Modify: `apps/web/src/features/review-source-permissions/ui/ReviewSourcePermissions.tsx`
- Modify: `apps/web/src/features/review-source-permissions/model/use-review-source-permissions.ts`
- Modify: `apps/web/src/features/manage-source-credential/model/use-source-credential-actions.ts`
- Modify: `apps/web/src/features/authenticate-source-credential/model/use-source-credential-auth.ts`
- Modify: `apps/web/src/features/manage-source-network-profile/model/use-source-network-profile-actions.ts`
- Modify: `apps/web/src/features/resolve-source-auth-challenge/model/use-resolve-source-auth-challenge.ts`
- Modify: `apps/web/src/features/manage-source-plugins/model/use-source-plugin-actions.ts`
- Modify: `apps/web/src/features/import-source-plugin-project/model/use-import-source-plugin-project.ts`
- Modify: `apps/web/src/features/delete-source-plugin-project/model/use-delete-source-plugin-project.ts`
- Test: `tests/regression/web-source-reader-features.test.ts`

**Interfaces:**

- Consumes: `useI18n().errorMessage(error, fallbackKey)` from each feature's existing i18n context.
- Produces: feature toasts, banners, and form errors containing only the safe user-facing message.

- [ ] **Step 1: Write the failing architecture test**

Replace the current source-reader contract that requires `getPublicErrorDescription` with assertions that every listed feature uses `errorMessage` and none imports the removed helper. Keep the existing secret-safety assertions for `error.details` and JSON serialization.

```ts
assert.doesNotMatch(source, /getPublicErrorDescription/);
assert.match(source, /errorMessage\(/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx tsx --test tests/regression/web-source-reader-features.test.ts`

Expected: FAIL because the feature slices still import and call `getPublicErrorDescription`.

- [ ] **Step 3: Migrate each feature to the i18n boundary**

For every hook/component already calling `useI18n`, change the destructuring to include `errorMessage` and replace:

```ts
getPublicErrorDescription(error);
```

with:

```ts
errorMessage(error);
```

Keep existing titles, conflict branching, retry actions, and mutation state unchanged. For `InspectSourceUrl` and `ReviewSourcePermissions`, pass the raw error into `ErrorBanner` when possible so the shared boundary performs the same interpretation.

- [ ] **Step 4: Remove the obsolete technical presentation helper**

Delete `getPublicErrorDescription` from `shared/api/errors.ts` and its export from `shared/api/index.ts`. Keep `getErrorMessage` because query logging and non-API error fallback still use it.

- [ ] **Step 5: Run the focused feature test and verify it passes**

Run: `npx tsx --test tests/regression/web-source-reader-features.test.ts`

Expected: PASS with no feature source importing the removed helper and no diagnostic fields rendered.

- [ ] **Step 6: Commit the feature migration**

```bash
git add apps/web/src/shared/api/errors.ts apps/web/src/shared/api/index.ts apps/web/src/features tests/regression/web-source-reader-features.test.ts
git commit -m "fix(web): route feature errors through i18n"
```

### Task 3: Verify the Cross-Cutting Error Contract

**Files:**

- Test only: existing web regression suites and shared API consumers.

**Interfaces:**

- Consumes: the completed shared interpreter and feature migration.
- Produces: evidence that message-first error presentation does not break typed conflict handling or unrelated error flows.

- [ ] **Step 1: Run the focused error and conflict tests**

Run: `npx tsx --test tests/regression/web-app-shell.test.ts tests/regression/web-source-reader-features.test.ts tests/regression/web-source-plugin-usage-conflict.test.ts tests/regression/web-search-index-sheet-contract.test.ts`

Expected: all tests pass.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all test groups pass. The known docs-cleanup issue is outside this feature and is not a reason to change production code.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and only the planned FE error-presentation files remain modified.

- [ ] **Step 4: Commit any final test-only adjustments**

```bash
git add tests/regression
git commit -m "test(web): lock message-first error presentation"
```
