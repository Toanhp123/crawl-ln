# Library Loading Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Eliminate the Continue Reading loading placeholder and detail request so the Library toolbar no longer jumps during page loading.

**Architecture:** Resolve the latest local reading-history entry against the already-fetched Library page. Render the toolbar before the optional hero, silently ignore stale history, and retain the existing initial grid skeleton and background refresh behavior.

**Tech Stack:** React 18, TypeScript, TanStack Query, Node test runner, Prettier, Vite.

## Global Constraints

- Do not add a new endpoint or dependency.
- Do not remove the Continue Reading feature.
- Do not replace existing Library data during background refresh.
- Keep source code compatible with the repository's FSD and contract guards.

---

### Task 1: Lock the stable-loading contract

**Files:**

- Create: `tests/regression/library-loading-stability.test.ts`
- Test: `tests/regression/library-loading-stability.test.ts`

**Interfaces:**

- Consumes: `LibraryPage.tsx` and `useLibraryPage.ts` source contracts.
- Produces: A regression guard that rejects a hero skeleton, a per-novel detail query, and toolbar placement below the optional hero.

- [x] **Step 1: Write the failing regression test**

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('library resolves continue reading from list data without shifting the toolbar', async () => {
  const [page, model] = await Promise.all([
    read('apps/web/src/pages/library/ui/LibraryPage.tsx'),
    read('apps/web/src/pages/library/model/useLibraryPage.ts')
  ]);

  assert.doesNotMatch(page, /ContinueReadingSkeleton/);
  assert.doesNotMatch(page, /primaryNovel\.isLoading/);
  assert.ok(page.indexOf('<StickyToolbar') < page.indexOf('<ContinueReadingHero'));
  assert.doesNotMatch(model, /\bgetNovel\b/);
  assert.doesNotMatch(model, /queryKeys\.novel\(/);
  assert.match(model, /items\.find\(\(novel\) => novel\.id === primaryEntry\?\.novelId\)/);
});
```

- [x] **Step 2: Run the test and confirm it fails for the old implementation**

Run: `node --import tsx --test tests/regression/library-loading-stability.test.ts`

Expected: FAIL because `ContinueReadingSkeleton`, `getNovel`, and the old toolbar order still exist.

### Task 2: Remove the extra query and unstable placeholder

**Files:**

- Modify: `apps/web/src/pages/library/model/useLibraryPage.ts`
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`
- Test: `tests/regression/library-loading-stability.test.ts`

**Interfaces:**

- Consumes: `novels.data.items`, `ReadingHistoryEntry`, existing `ContinueReadingHero` props.
- Produces: `readingHistory` containing zero or one `{ entry, novel }` pair derived from list data.

- [x] **Step 1: Resolve the newest reading entry from list items**

Replace the `getNovel` import and `primaryNovel` query with:

```ts
import { listNovels } from '@/entities/novel/api/novelApi';

const items = novels.data?.items ?? [];
const primaryEntry = historyEntries[0];
const primaryNovel = items.find((novel) => novel.id === primaryEntry?.novelId);
const readingHistory =
  primaryEntry && primaryNovel ? [{ entry: primaryEntry, novel: primaryNovel }] : [];
```

Remove `primaryReadingEntry` and the query object from the returned model.

- [x] **Step 2: Remove the Continue Reading skeleton**

Delete `ContinueReadingSkeleton`, remove the unused `Skeleton` usages belonging to it, and render `ContinueReadingHero` only when `primaryHistory` exists.

- [x] **Step 3: Keep the toolbar position stable**

Move the existing `<StickyToolbar>` block before the optional Continue Reading hero. Leave the initial `LibrarySkeleton` below the toolbar and leave background refresh behavior unchanged.

- [x] **Step 4: Run the focused regression test**

Run: `node --import tsx --test tests/regression/library-loading-stability.test.ts`

Expected: PASS, 1 test, 0 failures.

### Task 3: Verify repository quality gates

**Files:**

- Modify only files required by formatting.

**Interfaces:**

- Consumes: Updated Library implementation.
- Produces: A source archive that passes repository checks.

- [x] **Step 1: Format modified files**

Run: `npx prettier --write apps/web/src/pages/library/model/useLibraryPage.ts apps/web/src/pages/library/ui/LibraryPage.tsx tests/regression/library-loading-stability.test.ts docs/superpowers/specs/2026-07-19-library-loading-stability-design.md docs/superpowers/plans/2026-07-19-library-loading-stability.md`

Expected: All files formatted successfully.

- [x] **Step 2: Run web type-check**

Run: `npm run check -w apps/web`

Expected: Exit code 0.

- [x] **Step 3: Run all regression tests**

Run: `npm run test:regression`

Expected: All tests pass with 0 failures.

- [x] **Step 4: Run the full verification pipeline**

Run: `npm run verify`

Expected: Architecture guards, formatting, type-checks, regression tests, integration tests, and production builds all exit 0.
