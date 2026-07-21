# Novel Tool V3 Subproject 3: Frontend Foundation and Capability Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable `web-next` with strict semantic Feature-Sliced Design, pure reader behavior, and screen-by-screen parity with the current frontend.

**Architecture:** `apps/web-next` keeps route parsing and integration orchestration in `app` and `pages`, moves reads and query keys into `entities`, and moves every product action into a `feature`. Generic browser infrastructure and visual primitives remain in `shared`; realtime event interpretation lives in `app/realtime`; reader state and chapter-window algorithms live in the framework-free `packages/reader-engine` package.

**Tech Stack:** Node.js 22.12+, TypeScript 5.5 compiler API, React 18, React Router 7, TanStack Query 5, Vite 8, Tailwind CSS 3, Zod 3, Playwright 1.61, npm workspaces.

## Global Constraints

- Complete Subprojects 1 and 2 first; `api-next` on `NEXT_API_PORT=3100` is the V3 backend oracle for this plan.
- Preserve current routes, API request/response behavior, mobile behavior, English/Vietnamese copy, theme tokens, design-system primitives, loading states, and Source Reader secret redaction.
- Keep `apps/web` runnable on port `5173`; run `apps/web-next` on port `5174` and preview it on `4174`.
- Every FSD slice exposes `index.ts`; external consumers import only that public index.
- `shared` contains no novel, chapter, task, scheduler, Source Reader, reader-navigation, or product-mutation ownership.
- Entity reads, query hooks, query keys, and entity invalidation adapters live in `entities/<entity>`.
- Product writes, validation, mutation lifecycle, invalidation policy, and action UI live in `features/<action>`.
- Pages own URL parsing and composition only; `app` owns providers, router setup, and cross-cutting integrations only.
- `packages/reader-engine` imports no React, router, browser storage, browser global, application HTTP code, or `@novel-tool/shared` transport type.
- No visual redesign or V3-only product behavior is introduced in this subproject.
- Every production change follows RED -> GREEN -> REFACTOR.

---

## Locked Interfaces Produced by This Plan

Later screen tasks and Subproject 4 consume these exact public contracts:

```ts
export interface NovelInvalidationApi {
  invalidateAll(client: QueryClient): Promise<unknown>;
  invalidateList(client: QueryClient): Promise<unknown>;
  invalidateDetail(client: QueryClient, novelId: string): Promise<unknown>;
  invalidateStats(client: QueryClient): Promise<unknown>;
}

export interface TaskInvalidationApi {
  invalidateAll(client: QueryClient): Promise<unknown>;
  invalidateDetail(client: QueryClient, taskId: string): Promise<unknown>;
  invalidateForNovel(client: QueryClient, novelId: string): Promise<unknown>;
}

export interface CollectionInvalidationApi {
  invalidateAll(client: QueryClient): Promise<unknown>;
}

export interface RealtimeInvalidationRegistry {
  novels: NovelInvalidationApi;
  tasks: TaskInvalidationApi;
  scheduler: CollectionInvalidationApi;
  search: CollectionInvalidationApi;
  sourceReader: CollectionInvalidationApi;
}

export interface ReaderChapterIdentity {
  id: string;
  index: number;
  contentVersion: number;
}

export interface ReaderChapterCache<TChapter extends ReaderChapterIdentity> {
  get(novelId: string, identity: ReaderChapterIdentity): Promise<TChapter | null>;
  set(novelId: string, chapter: TChapter): Promise<void>;
}

export interface ReaderChapterLoader<TChapter extends ReaderChapterIdentity> {
  load(novelId: string, index: number, signal: AbortSignal): Promise<TChapter>;
}

export interface ReaderChapterSourceApi<TChapter extends ReaderChapterIdentity> {
  load(
    novelId: string,
    identity: ReaderChapterIdentity,
    signal: AbortSignal
  ): Promise<TChapter>;
}

export interface ReaderSessionSnapshot<TChapter extends ReaderChapterIdentity> {
  chapters: readonly TChapter[];
  activeIndex: number;
  loading: 'idle' | 'initial' | 'previous' | 'next';
  error: unknown | null;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface CreateReaderSessionOptions<TChapter extends ReaderChapterIdentity> {
  loader: ReaderChapterLoader<TChapter>;
  cache: ReaderChapterCache<TChapter>;
  persistentCache?: ReaderChapterCache<TChapter>;
  limit?: number;
}

export interface ReaderSession<TChapter extends ReaderChapterIdentity> {
  start(
    novelId: string,
    chapters: readonly ReaderChapterIdentity[],
    activeIndex: number
  ): Promise<void>;
  loadPrevious(): Promise<boolean>;
  loadNext(): Promise<boolean>;
  setActiveIndex(index: number): void;
  retry(): Promise<void>;
  cancel(): void;
  snapshot(): ReaderSessionSnapshot<TChapter>;
  subscribe(listener: (snapshot: ReaderSessionSnapshot<TChapter>) => void): () => void;
}
```

### Task 1: Scaffold the Parallel `web-next` Runtime

**Files:**
- Create: `apps/web-next/package.json`
- Create: `apps/web-next/tsconfig.json`
- Create: `apps/web-next/vite.config.ts`
- Create: `apps/web-next/index.html`
- Create: `apps/web-next/src/vite-env.d.ts`
- Create: `apps/web-next/src/main.tsx`
- Create: `apps/web-next/src/app/providers/AppProviders.tsx`
- Create: `apps/web-next/src/app/router/AppRouter.tsx`
- Create: `apps/web-next/src/pages/foundation/index.ts`
- Create: `apps/web-next/src/pages/foundation/ui/FoundationPage.tsx`
- Create: `apps/web-next/src/shared/config/index.ts`
- Create: `apps/web-next/src/shared/config/api.ts`
- Create: `apps/web-next/src/shared/config/build.ts`
- Create: `tests/regression/web-next-scaffold.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the existing React/Vite dependency versions and API-next default port `3100`.
- Produces: package `@novel-tool/web-next`, development port `5174`, preview port `4174`, and root scripts `dev:web-next`, `check:web-next`, and `build:web-next`.

- [ ] **Step 1: Write the failing scaffold test**

```ts
test('web-next is an isolated workspace with isolated ports', async () => {
  const workspace = JSON.parse(await readFile('apps/web-next/package.json', 'utf8'));
  const vite = await readFile('apps/web-next/vite.config.ts', 'utf8');
  const api = await readFile('apps/web-next/src/shared/config/api.ts', 'utf8');
  assert.equal(workspace.name, '@novel-tool/web-next');
  assert.match(vite, /port:\s*5174/);
  assert.match(vite, /http:\/\/localhost:3100/);
  assert.match(vite, /preview:\s*\{\s*port:\s*4174/s);
  assert.match(vite, /__APP_VERSION__/);
  assert.match(api, /http:\/\/127\.0\.0\.1:3100/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-scaffold.test.ts`.

Expected: failure because `apps/web-next/package.json` does not exist.

- [ ] **Step 3: Implement the minimal runnable workspace**

Use this Vite boundary and keep root defaults pointed at the current frontend:

```ts
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5174, proxy: { '/api': 'http://localhost:3100' } },
  preview: { port: 4174 }
});
```

The initial router renders `FoundationPage` at `/` and `/library`; `AppProviders` contains only `BrowserRouter` until later provider tasks. `API_BASE_URL` defaults to `http://127.0.0.1:3100` and remains overridable through `VITE_API_BASE_URL`. Preserve current package-version and Git build-ID injection through `__APP_VERSION__` and `__APP_BUILD__`.

- [ ] **Step 4: Run scaffold verification**

```powershell
node --import tsx --test tests/regression/web-next-scaffold.test.ts
npm run check:web-next
npm run build:web-next
```

Expected: all commands exit 0 and `apps/web` remains unchanged and runnable.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next tests/regression/web-next-scaffold.test.ts package.json package-lock.json
git commit -m "feat: scaffold v3 web runtime"
```

### Task 2: Add the Strict TypeScript-AST FSD Guard

**Files:**
- Create: `scripts/lib/web-next-architecture.mjs`
- Create: `scripts/check-web-next-architecture.mjs`
- Create: `tests/regression/web-next-architecture-guard.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: TypeScript compiler API and the `@/* -> apps/web-next/src/*` alias.
- Produces: `checkWebNextArchitecture(projectRoot): Promise<string[]>` and `npm run check:web-next-arch`.

- [ ] **Step 1: Write failing fixture-based architecture tests**

```ts
test('guard resolves alias, relative, export, and dynamic deep imports', async () => {
  const root = await fixture({
    'src/entities/novel/index.ts': 'export const novel = 1;',
    'src/entities/novel/model/private.ts': 'export const privateValue = 1;',
    'src/pages/library/index.ts': "export * from './ui/Page';",
    'src/pages/library/ui/Page.ts': [
      "import { privateValue } from '@/entities/novel/model/private';",
      "export { privateValue as leaked } from '../../../entities/novel/model/private';",
      "export const load = () => import('@/entities/novel/model/private');"
    ].join('\n')
  });
  const errors = await checkWebNextArchitecture(root);
  assert.equal(errors.filter((item) => item.includes('public index')).length, 3);
});

test('guard rejects missing slice indexes, domain shared state, and page mutations', async () => {
  const root = await fixture({
    'src/shared/api/novelQueryKeys.ts': "export const novelKeys = ['novels'];",
    'src/entities/task/model/private.ts': 'export const task = 1;',
    'src/features/save/index.ts': 'export {};',
    'src/pages/settings/index.ts': "export * from './ui/Page';",
    'src/pages/settings/ui/Page.tsx':
      "import { useMutation } from '@tanstack/react-query'; export const Page = () => useMutation({ mutationFn: async () => 1 }) as never;"
  });
  const errors = await checkWebNextArchitecture(root);
  assert.ok(errors.some((item) => item.includes('shared cannot own domain concepts')));
  assert.ok(errors.some((item) => item.includes('slice is missing index.ts')));
  assert.ok(errors.some((item) => item.includes('pages cannot own product mutations')));
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-architecture-guard.test.ts`.

Expected: failure because `checkWebNextArchitecture` is missing.

- [ ] **Step 3: Implement compiler-backed rules**

The checker must parse `ImportDeclaration`, `ExportDeclaration`, `ImportTypeNode`, `require()`, and dynamic `import()`, resolve aliases and relative paths, and enforce all of these rules:

```js
export const layerRank = new Map([
  ['shared', 0],
  ['entities', 1],
  ['features', 2],
  ['widgets', 3],
  ['pages', 4],
  ['app', 5]
]);

export const forbiddenSharedMarkers = [
  /(^|\/)(novel|chapter|task|scheduler|source-reader|reader-navigation)(\/|\.|$)/i,
  /\/api\/(novels|crawl|tasks|scheduler|source-reader|search|backups|exports?)(\/|['"`?])/i,
  /\b(NovelQueryKeys|ChapterQueryKeys|TaskQueryKeys|SourceReader|ReaderPreferences)\b/
];
```

Also reject upward imports, same-layer cross-slice imports, any external slice import that resolves below its `index.ts`, missing slice indexes in `entities/features/widgets/pages`, direct TanStack query hooks outside `entities`, direct TanStack mutation hooks outside `features`, mutating HTTP methods in `app/pages`, and direct imports between page slices. Scan shared TypeScript declarations/string literals and shared CSS selectors/custom properties for the forbidden domain markers, including `data-reader-*`, `--reader-*`, and `.reader-*`. Allow technical uses such as timer schedulers and the `novel-tool` product-name storage prefix.

- [ ] **Step 4: Run the guard against fixtures and the real scaffold**

```powershell
node --import tsx --test tests/regression/web-next-architecture-guard.test.ts
npm run check:web-next-arch
```

Expected: fixtures report the locked violations and the real `web-next` tree passes.

- [ ] **Step 5: Commit**

```powershell
git add scripts/lib/web-next-architecture.mjs scripts/check-web-next-architecture.mjs tests/regression/web-next-architecture-guard.test.ts package.json
git commit -m "test: enforce semantic fsd in web next"
```

### Task 3: Port the Domain-Free Shared Platform and Visual Foundation

**Files:**
- Create: `apps/web-next/src/shared/api/index.ts`
- Create: `apps/web-next/src/shared/api/http.ts`
- Create: `apps/web-next/src/shared/api/errors.ts`
- Create: `apps/web-next/src/shared/api/query-client.ts`
- Create: `apps/web-next/src/shared/api/query-persistence.ts`
- Create: `apps/web-next/src/shared/i18n/index.ts`
- Create: `apps/web-next/src/shared/i18n/I18nProvider.tsx`
- Create: `apps/web-next/src/shared/i18n/catalog.ts`
- Create: `apps/web-next/src/shared/lib/index.ts`
- Create: `apps/web-next/src/shared/lib/cn.ts`
- Create: `apps/web-next/src/shared/lib/use-debounced-value.ts`
- Create: `apps/web-next/src/shared/lib/use-scroll-restoration.ts`
- Create: `apps/web-next/src/shared/realtime/index.ts`
- Create: `apps/web-next/src/shared/realtime/connection-status.tsx`
- Create: `apps/web-next/src/shared/realtime/event-stream.ts`
- Create: `apps/web-next/src/shared/realtime/batch-queue.ts`
- Create: `apps/web-next/src/shared/theme/` from the current token files after extracting reader-specific selectors
- Create: `apps/web-next/src/shared/theme/runtime/AppThemeProvider.tsx`
- Create: `apps/web-next/src/shared/ui/` from the current primitive library
- Create: `tests/regression/web-next-shared-foundation.test.ts`

**Interfaces:**
- Consumes: current HTTP envelope handling, generic query persistence behavior, design tokens, and UI primitives.
- Produces: domain-free public shared APIs, `ConnectionStatus`, `createEventStream`, `createBatchQueue`, generic catalog composition, and visual parity primitives.

- [ ] **Step 1: Write failing shared-boundary tests**

```ts
test('shared query persistence receives policy instead of naming entity roots', async () => {
  const source = await readFile('apps/web-next/src/shared/api/query-persistence.ts', 'utf8');
  assert.match(source, /shouldPersist:\s*\(query: Query\) => boolean/);
  assert.doesNotMatch(source, /novels|chapters|tasks|scheduler|source-reader/);
});

test('shared theme excludes reader-owned tokens and runtime state', async () => {
  const files = await readTree('apps/web-next/src/shared/theme');
  assert.doesNotMatch(files, /data-reader-|ReaderPreferences|reader-chapter-enter|reader-content-max/);
});

test('shared localization has no product-specific error interpretation', async () => {
  const source = await readTree('apps/web-next/src/shared/i18n');
  assert.doesNotMatch(source, /chapterContent|sourceReader|crawlTask|schedulerStatus/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-shared-foundation.test.ts`.

Expected: missing shared files.

- [ ] **Step 3: Port and split the shared foundation**

Copy the current `shared/ui` primitives and non-reader theme rules without changing markup or tokens. Replace domain-aware persistence and localization with injected policies:

```ts
export interface QueryPersistenceOptions {
  buster: string;
  maxAgeMs: number;
  shouldPersist(query: Query): boolean;
}

export function mergeCatalogs(
  ...catalogs: ReadonlyArray<Readonly<Record<string, string>>>
): Readonly<Record<string, string>> {
  return Object.assign({}, ...catalogs);
}
```

`shared/realtime` opens a generic `EventSource`, parses JSON through a caller-supplied decoder, batches caller-supplied values, and exposes only `connecting | connected | disconnected`. Move reader CSS variables, reader motion classes, and reader preference persistence out of the copied theme; Task 11 gives them feature ownership.

- [ ] **Step 4: Run shared and architecture verification**

```powershell
node --import tsx --test tests/regression/web-next-shared-foundation.test.ts
npm run check:web-next-arch
npm run check:web-next
```

Expected: shared is domain-free, copied primitives compile, and the FSD checker passes.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/shared tests/regression/web-next-shared-foundation.test.ts
git commit -m "feat: add domain free web platform"
```

### Task 4: Build Library, Chapter, Task, Scheduler, and Search Entities

**Files:**
- Create: `apps/web-next/src/entities/novel/api/novel-api.ts`
- Create: `apps/web-next/src/entities/novel/api/novel-queries.ts`
- Create: `apps/web-next/src/entities/novel/api/novel-keys.ts`
- Create: `apps/web-next/src/entities/novel/api/novel-invalidation.ts`
- Create: `apps/web-next/src/entities/novel/model/types.ts`
- Create: `apps/web-next/src/entities/novel/ui/NovelCover.tsx`
- Create: `apps/web-next/src/entities/novel/ui/NovelLibraryCard.tsx`
- Create: `apps/web-next/src/entities/novel/index.ts`
- Create: `apps/web-next/src/entities/chapter/api/chapter-api.ts`
- Create: `apps/web-next/src/entities/chapter/api/chapter-queries.ts`
- Create: `apps/web-next/src/entities/chapter/api/chapter-keys.ts`
- Create: `apps/web-next/src/entities/chapter/lib/paragraph-dom-id.ts`
- Create: `apps/web-next/src/entities/chapter/ui/ChapterList.tsx`
- Create: `apps/web-next/src/entities/chapter/ui/ChapterReader.tsx`
- Create: `apps/web-next/src/entities/chapter/index.ts`
- Create: `apps/web-next/src/entities/task/api/task-api.ts`
- Create: `apps/web-next/src/entities/task/api/task-queries.ts`
- Create: `apps/web-next/src/entities/task/api/task-keys.ts`
- Create: `apps/web-next/src/entities/task/api/task-invalidation.ts`
- Create: `apps/web-next/src/entities/task/model/status.ts`
- Create: `apps/web-next/src/entities/task/model/outcome.ts`
- Create: `apps/web-next/src/entities/task/ui/TaskProgress.tsx`
- Create: `apps/web-next/src/entities/task/index.ts`
- Create: `apps/web-next/src/entities/scheduler/api/scheduler-api.ts`
- Create: `apps/web-next/src/entities/scheduler/api/scheduler-queries.ts`
- Create: `apps/web-next/src/entities/scheduler/api/scheduler-keys.ts`
- Create: `apps/web-next/src/entities/scheduler/api/scheduler-invalidation.ts`
- Create: `apps/web-next/src/entities/scheduler/index.ts`
- Create: `apps/web-next/src/entities/search/api/search-api.ts`
- Create: `apps/web-next/src/entities/search/api/search-queries.ts`
- Create: `apps/web-next/src/entities/search/api/search-keys.ts`
- Create: `apps/web-next/src/entities/search/api/search-invalidation.ts`
- Create: `apps/web-next/src/entities/search/index.ts`
- Create: `tests/regression/web-next-core-entities.test.ts`

**Interfaces:**
- Consumes: current GET endpoints and `@novel-tool/shared` transport types at the HTTP boundary.
- Produces: `useNovels`, `useNovel`, `useNovelStats`, public `getChapter`, `useChapter`, `useTasks`, `useTask`, `useTaskEvents`, `useTaskSummary`, `useNovelTask`, `useSchedulerStatus`, `useNovelUpdateDiagnostics`, `useLibrarySearch`, colocated key factories, and locked invalidation APIs.

- [ ] **Step 1: Write failing entity ownership tests**

```ts
test('core entity public APIs export reads, keys, and invalidation adapters', async () => {
  const novel = await import('../../apps/web-next/src/entities/novel/index.ts');
  assert.equal(typeof novel.useNovels, 'function');
  assert.deepEqual(novel.novelKeys.detail('novel-1'), ['novels', 'detail', 'novel-1']);
  assert.equal(typeof novel.novelInvalidation.invalidateStats, 'function');
});

test('entity APIs contain GET reads but no product writes', async () => {
  const source = await readTree('apps/web-next/src/entities');
  assert.doesNotMatch(
    source,
    /useMutation|method:\s*['"]POST|method:\s*['"]PUT|method:\s*['"]PATCH|method:\s*['"]DELETE/
  );
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-core-entities.test.ts`.

Expected: missing entity slices.

- [ ] **Step 3: Implement read-only entity public APIs**

Use stable key factories and hooks that accept `enabled`, `staleTime`, and generic connection status where polling fallback is needed:

```ts
export const novelKeys = {
  all: ['novels'] as const,
  lists: () => ['novels', 'list'] as const,
  list: (query: ListNovelsOptions) => ['novels', 'list', query] as const,
  detail: (id: string) => ['novels', 'detail', id] as const,
  stats: () => ['novels', 'stats'] as const
};

export const novelInvalidation: NovelInvalidationApi = {
  invalidateAll: (client) => client.invalidateQueries({ queryKey: novelKeys.all }),
  invalidateList: (client) => client.invalidateQueries({ queryKey: novelKeys.lists() }),
  invalidateDetail: (client, id) => client.invalidateQueries({ queryKey: novelKeys.detail(id) }),
  invalidateStats: (client) => client.invalidateQueries({ queryKey: novelKeys.stats() })
};
```

Keep transport mapping in each entity API file; UI and models consume slice-owned aliases rather than importing deep transport paths.

- [ ] **Step 4: Run entity, FSD, and type checks**

```powershell
node --import tsx --test tests/regression/web-next-core-entities.test.ts
npm run check:web-next-arch
npm run check:web-next
```

Expected: all entity slices pass through their public indexes and no mutation remains in entities.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/entities tests/regression/web-next-core-entities.test.ts
git commit -m "feat: add v3 core entity queries"
```

### Task 5: Build Source Reader Entity Query Slices

**Files:**
- Create: `apps/web-next/src/entities/source-plugin/`
- Create: `apps/web-next/src/entities/source-credential/`
- Create: `apps/web-next/src/entities/source-network-profile/`
- Create: `apps/web-next/src/entities/source-auth-challenge/`
- Create: `tests/regression/web-next-source-reader-entities.test.ts`

**Interfaces:**
- Consumes: Source Reader GET contracts, diagnostics/redaction contracts, and generic HTTP client.
- Produces: public hooks, key factories, and one `CollectionInvalidationApi` per plugin, credential, network-profile, and authentication-challenge entity.

- [ ] **Step 1: Write failing query and redaction-boundary tests**

```ts
test('Source Reader entity APIs expose metadata reads without secret fields', async () => {
  const credential = await import(
    '../../apps/web-next/src/entities/source-credential/index.ts'
  );
  assert.deepEqual(credential.sourceCredentialKeys.list(), ['source-reader', 'credentials']);
  const source = await readTree('apps/web-next/src/entities/source-credential');
  assert.doesNotMatch(source, /passwordValue|cookieValue|tokenValue|secretValue/);
});

test('Source Reader entity APIs contain no administration mutations', async () => {
  const source = (
    await Promise.all([
      'source-plugin',
      'source-credential',
      'source-network-profile',
      'source-auth-challenge'
    ].map((slice) => readTree(`apps/web-next/src/entities/${slice}`)))
  ).join('\n');
  assert.doesNotMatch(source, /install|enablePlugin|disablePlugin|deleteCredential|useMutation/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-source-reader-entities.test.ts`.

Expected: missing Source Reader entity slices.

- [ ] **Step 3: Port normalized metadata reads**

Each entity uses `api/`, `model/`, `ui/`, `i18n/`, and `index.ts`. Split current mixed `sourcePluginApi.ts`, `sourceCredentialApi.ts`, and `sourceNetworkProfileApi.ts` so only GET functions and query hooks remain. Each slice exports its own adapter without importing a sibling entity:

```ts
export const sourcePluginInvalidation: CollectionInvalidationApi = {
  invalidateAll: (client) => client.invalidateQueries({ queryKey: sourcePluginKeys.all })
};
```

Never add secret request models to entity metadata models; feature-local forms own write-only secret values.

- [ ] **Step 4: Run Source Reader entity and architecture checks**

```powershell
node --import tsx --test tests/regression/web-next-source-reader-entities.test.ts
npm run check:web-next-arch
npm run check:web-next
```

Expected: passes with public-index-only imports and redacted models.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/entities/source-* tests/regression/web-next-source-reader-entities.test.ts
git commit -m "feat: add v3 source reader entities"
```

### Task 6: Implement Library and Task Action Features

**Files:**
- Create: `apps/web-next/src/features/add-novel/`
- Create: `apps/web-next/src/features/crawl-novel/`
- Create: `apps/web-next/src/features/update-novel/`
- Create: `apps/web-next/src/features/delete-novel/`
- Create: `apps/web-next/src/features/pause-task/`
- Create: `apps/web-next/src/features/resume-task/`
- Create: `apps/web-next/src/features/cancel-task/`
- Create: `tests/regression/web-next-library-task-features.test.ts`

**Interfaces:**
- Consumes: `novelKeys`, `taskKeys`, entity invalidation APIs, generic HTTP, toast primitives, and current mutation contracts.
- Produces: action hooks/UI for analyze-then-crawl, crawl, update, delete, pause, resume, and cancel; `AddNovelProvider`, `AddNovelOverlay`, and `useAddNovelOverlay`.

- [ ] **Step 1: Write failing workflow and ownership tests**

```ts
test('add novel analyzes before creating a crawl job and invalidates both entities', async () => {
  const calls: string[] = [];
  const workflow = createAddNovelWorkflow({
    analyze: async () => (calls.push('analyze'), { novel: { id: 'novel-1' } } as never),
    crawl: async () => (calls.push('crawl'), { id: 'task-1', novelId: 'novel-1' } as never)
  });
  const result = await workflow.execute('https://example.test/book');
  assert.deepEqual(calls, ['analyze', 'crawl']);
  assert.equal(result.novelId, 'novel-1');
});

test('app and pages do not own add-novel or task mutations', async () => {
  const source = await readTree('apps/web-next/src/app', 'apps/web-next/src/pages');
  assert.doesNotMatch(source, /useMutation|analyzeNovel|pauseTask|resumeTask|cancelTask/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-library-task-features.test.ts`.

Expected: missing feature workflows.

- [ ] **Step 3: Implement feature-owned mutations and invalidation**

`features/add-novel` owns URL validation, analyze-then-crawl sequencing, overlay state, clipboard action, pending-close guard, toast copy, and invalidation. Each task control has a narrow mutation:

```ts
export function usePauseTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: pauseTask,
    onSuccess: async (task) => {
      await Promise.all([
        taskInvalidation.invalidateDetail(client, task.id),
        taskInvalidation.invalidateForNovel(client, task.novelId),
        taskInvalidation.invalidateAll(client)
      ]);
    }
  });
}
```

Every slice exports only its intended hook/component through `index.ts`; features may import entity public APIs but not entity internals.

- [ ] **Step 4: Run feature and architecture checks**

```powershell
node --import tsx --test tests/regression/web-next-library-task-features.test.ts
npm run check:web-next-arch
npm run check:web-next
```

Expected: all mutations are feature-owned and compile.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/features/add-novel apps/web-next/src/features/crawl-novel apps/web-next/src/features/update-novel apps/web-next/src/features/delete-novel apps/web-next/src/features/pause-task apps/web-next/src/features/resume-task apps/web-next/src/features/cancel-task tests/regression/web-next-library-task-features.test.ts
git commit -m "feat: add v3 library and task actions"
```

### Task 7: Implement Scheduler, Search, Export, Backup, and Settings Features

**Files:**
- Create: `apps/web-next/src/features/update-auto-update/`
- Create: `apps/web-next/src/features/run-scheduler/`
- Create: `apps/web-next/src/features/search-library/`
- Create: `apps/web-next/src/features/rebuild-search-index/`
- Create: `apps/web-next/src/features/export-novel/`
- Create: `apps/web-next/src/features/backup-library/`
- Create: `apps/web-next/src/features/configure-appearance/`
- Create: `apps/web-next/src/features/configure-language/`
- Create: `tests/regression/web-next-settings-data-features.test.ts`

**Interfaces:**
- Consumes: scheduler/search entity APIs, novel public models, generic theme/i18n commands, HTTP binary helpers, and current backup/export contracts.
- Produces: feature-owned settings controls, scheduler mutations, search input/results orchestration, index rebuild, binary export, and backup create/restore workflows.

- [ ] **Step 1: Write failing feature contract tests**

```ts
test('binary features preserve filenames and 204/error semantics', async () => {
  const artifact = await createExportClient(fakeFetch({
    status: 200,
    headers: { 'content-disposition': 'attachment; filename="book.epub"' },
    body: new Uint8Array([1, 2, 3])
  })).download({ novelId: 'novel-1', format: 'epub' });
  assert.equal(artifact.filename, 'book.epub');
  assert.deepEqual([...artifact.content], [1, 2, 3]);
});

test('settings page sources contain no mutation hooks', async () => {
  const source = await readTree('apps/web-next/src/pages/settings');
  assert.doesNotMatch(source, /useMutation|runSchedulerTick|restoreBackup|rebuildSearchIndex/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-settings-data-features.test.ts`.

Expected: missing feature clients and page boundary.

- [ ] **Step 3: Port action behavior into dedicated slices**

Keep query input and result selection in `search-library`, but call `useLibrarySearch` from the search entity. `rebuild-search-index` owns the POST and search invalidation. `backup-library` keeps replace/merge confirmation, password handling, maintenance feedback, and response validation inside the feature. `configure-appearance` and `configure-language` wrap generic shared provider commands so pages render controls without owning state transitions.

Use one binary result contract:

```ts
export interface DownloadArtifact {
  filename: string;
  contentType: string;
  content: Uint8Array;
}
```

- [ ] **Step 4: Run feature, HTTP contract, and FSD checks**

```powershell
node --import tsx --test tests/regression/web-next-settings-data-features.test.ts
npm run check:web-contracts
npm run check:web-next-arch
npm run check:web-next
```

Expected: binary contracts remain unchanged and all actions are feature-owned.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/features/update-auto-update apps/web-next/src/features/run-scheduler apps/web-next/src/features/search-library apps/web-next/src/features/rebuild-search-index apps/web-next/src/features/export-novel apps/web-next/src/features/backup-library apps/web-next/src/features/configure-appearance apps/web-next/src/features/configure-language tests/regression/web-next-settings-data-features.test.ts
git commit -m "feat: add v3 settings and data actions"
```

### Task 8: Implement Source Reader Administration Features

**Files:**
- Create: `apps/web-next/src/features/install-source-plugin/`
- Create: `apps/web-next/src/features/manage-source-plugins/`
- Create: `apps/web-next/src/features/review-source-permissions/`
- Create: `apps/web-next/src/features/test-source-plugin/`
- Create: `apps/web-next/src/features/manage-source-credential/`
- Create: `apps/web-next/src/features/authenticate-source-credential/`
- Create: `apps/web-next/src/features/manage-source-network-profile/`
- Create: `apps/web-next/src/features/resolve-source-auth-challenge/`
- Create: `apps/web-next/src/features/inspect-source-url/`
- Create: `tests/regression/web-next-source-reader-features.test.ts`

**Interfaces:**
- Consumes: Source Reader entity metadata, public query keys, generic HTTP/form-data helpers, and current admin contracts.
- Produces: all Source Reader write workflows and action UI with optimistic rollback and secret-safe errors.

- [ ] **Step 1: Write failing optimistic and secret-safety tests**

```ts
test('plugin toggle rolls back cached state when the server rejects the write', async () => {
  const client = createTestQueryClient();
  client.setQueryData(sourcePluginKeys.list(), [{ id: 'plugin-1', enabled: true }]);
  const action = createPluginToggleAction({ request: async () => Promise.reject(new Error('x')) });
  await assert.rejects(() => action.execute(client, 'plugin-1', false));
  assert.equal(client.getQueryData<any[]>(sourcePluginKeys.list())?.[0]?.enabled, true);
});

test('feature errors never render submitted credential or proxy secrets', async () => {
  const source = await readTree('apps/web-next/src/features');
  assert.doesNotMatch(source, /toast\([^)]*(password|cookie|token|proxyPassword)/s);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-source-reader-features.test.ts`.

Expected: Source Reader feature slices are missing.

- [ ] **Step 3: Port administration actions behind public entity APIs**

Move every current POST/PUT/DELETE/form-data function from entity files into the owning feature. Keep credential secrets and proxy passwords in feature-local form types and clear them after success or close. Use `onMutate/onError/onSettled` for plugin enable/disable rollback, call only the relevant public entity invalidation adapters after each administration write, and preserve request-ID/error-code display without rendering response details that are not in the public redacted contract. Each feature exports its EN/VI catalog through its public index.

- [ ] **Step 4: Run Source Reader feature and existing security tests**

```powershell
node --import tsx --test tests/regression/web-next-source-reader-features.test.ts
node --import tsx --test tests/regression/source-reader-web-console-contract.test.ts tests/regression/source-reader-web-contract.test.ts
npm run check:web-next-arch
```

Expected: action parity, rollback behavior, and secret-redaction checks pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/features/install-source-plugin apps/web-next/src/features/manage-source-plugins apps/web-next/src/features/review-source-permissions apps/web-next/src/features/test-source-plugin apps/web-next/src/features/manage-source-credential apps/web-next/src/features/authenticate-source-credential apps/web-next/src/features/manage-source-network-profile apps/web-next/src/features/resolve-source-auth-challenge apps/web-next/src/features/inspect-source-url tests/regression/web-next-source-reader-features.test.ts
git commit -m "feat: add v3 source reader actions"
```

### Task 9: Route Realtime Events in `app/realtime`

**Files:**
- Create: `apps/web-next/src/app/realtime/event-router.ts`
- Create: `apps/web-next/src/app/realtime/RealtimeProvider.tsx`
- Create: `apps/web-next/src/app/realtime/index.ts`
- Modify: `apps/web-next/src/app/providers/AppProviders.tsx`
- Create: `tests/regression/web-next-realtime-routing.test.ts`

**Interfaces:**
- Consumes: generic `createEventStream`, generic batching, `RealtimeEvent`, and the locked invalidation registry.
- Produces: `routeRealtimeEvent(event, registry, client)`, app-owned SSE lifecycle, and generic connection status for disconnected polling fallback.

- [ ] **Step 1: Write failing exact-routing tests**

```ts
test('realtime resources call only public entity invalidation adapters', async () => {
  const calls: string[] = [];
  const registry = invalidationRegistrySpy(calls);
  await routeRealtimeEvent(
    event({ resources: ['tasks', 'novels'], taskId: 'task-1', novelId: 'novel-1' }),
    registry,
    {} as QueryClient
  );
  assert.deepEqual(calls, [
    'tasks:all',
    'tasks:detail:task-1',
    'tasks:novel:novel-1',
    'novels:list',
    'novels:stats',
    'novels:detail:novel-1'
  ]);
});

test('shared realtime contains no transport resource names', async () => {
  const source = await readTree('apps/web-next/src/shared/realtime');
  assert.doesNotMatch(source, /novels|tasks|scheduler|plugins|search/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-realtime-routing.test.ts`.

Expected: app realtime router is missing.

- [ ] **Step 3: Implement app-level event interpretation**

Batch events for `150ms`. Map `tasks`, `novels`, `scheduler`, and `search` to public adapters. Construct `registry.sourceReader` in `app/realtime` by calling the four Source Reader entity adapters in `Promise.all`, then map `plugins` to that app-owned aggregate. Map `all` to `queryClient.invalidateQueries()`. On reconnect after the first connection, invalidate active queries. On tab visibility restoration, invalidate active queries. Parsing failures log only the event ID/error class and never raw payload content.

- [ ] **Step 4: Run realtime, architecture, and type checks**

```powershell
node --import tsx --test tests/regression/web-next-realtime-routing.test.ts
npm run check:web-next-arch
npm run check:web-next
```

Expected: exact adapter calls pass and shared remains generic.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/app/realtime apps/web-next/src/app/providers/AppProviders.tsx tests/regression/web-next-realtime-routing.test.ts
git commit -m "feat: route v3 realtime invalidations"
```

### Task 10: Extract the Pure `reader-engine` Package

**Files:**
- Create: `packages/reader-engine/package.json`
- Create: `packages/reader-engine/tsconfig.json`
- Create: `packages/reader-engine/src/contracts.ts`
- Create: `packages/reader-engine/src/memory-cache.ts`
- Create: `packages/reader-engine/src/chapter-source.ts`
- Create: `packages/reader-engine/src/reader-window.ts`
- Create: `packages/reader-engine/src/reader-session.ts`
- Create: `packages/reader-engine/src/index.ts`
- Create: `packages/reader-engine/tests/reader-window.test.ts`
- Create: `packages/reader-engine/tests/chapter-source.test.ts`
- Create: `packages/reader-engine/tests/reader-session.test.ts`
- Create: `scripts/prepare-reader-engine.mjs`
- Create: `scripts/check-reader-engine-architecture.mjs`
- Create: `tests/regression/reader-engine-architecture.test.ts`
- Modify: `scripts/prepare-packages.mjs`
- Modify: `scripts/check-prepared.mjs`
- Modify: `scripts/build-prepared.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: only platform-neutral TypeScript/ECMAScript and locked reader contracts.
- Produces: `MemoryReaderChapterCache`, `ReaderChapterSource`, `createReaderWindow`, and `createReaderSession` from package `@novel-tool/reader-engine`.

- [ ] **Step 1: Write failing engine behavior and purity tests**

```ts
test('reader session cancels stale loads and keeps a bounded window', async () => {
  const loader = controllableLoader();
  const session = createReaderSession({ loader, cache: new MemoryReaderChapterCache(8), limit: 5 });
  const first = session.start('novel-1', identities(1, 10), 3);
  const second = session.start('novel-2', identities(20, 30), 22);
  loader.resolve('novel-1', 3, chapter(3));
  loader.resolve('novel-2', 22, chapter(22));
  await Promise.allSettled([first, second]);
  assert.deepEqual(session.snapshot().chapters.map((item) => item.index), [22]);
});

test('reader engine imports no framework, browser, app, or transport dependency', async () => {
  assert.deepEqual(await checkReaderEngineArchitecture(process.cwd()), []);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --import tsx --test packages/reader-engine/tests/*.test.ts
node --import tsx --test tests/regression/reader-engine-architecture.test.ts
```

Expected: package and architecture checker are missing.

- [ ] **Step 3: Implement framework-free reader behavior**

`ReaderChapterSource` checks memory, then optional persistent cache, then loader; validates loaded IDs against the current identity; writes caches only if the signal is still active. `createReaderSession` owns session generation, abort controllers, initial/previous/next loading, deduplication, active-index state, prefetch, retry, and bounded eviction.

Package metadata exposes only `dist/index.js` and `dist/index.d.ts`, sets `sideEffects: false`, and defines `build`, `check`, and `test` scripts. `prepare-reader-engine.mjs` emits the package before any web-next command that imports it.

The purity checker rejects imports matching `react`, `react-dom`, `react-router`, `@novel-tool/shared`, `apps/`, and AST identifiers `window`, `document`, `indexedDB`, `localStorage`, `sessionStorage`, `navigator`, and `EventSource`.

- [ ] **Step 4: Run package tests, preparation, and purity checks**

```powershell
npm run prepare:packages
npm run check -w @novel-tool/reader-engine
npm run test -w @novel-tool/reader-engine
npm run check:reader-engine-arch
```

Expected: all engine tests pass and `dist` is produced through the normal package preparation graph.

- [ ] **Step 5: Commit**

```powershell
git add packages/reader-engine scripts/prepare-reader-engine.mjs scripts/check-reader-engine-architecture.mjs scripts/prepare-packages.mjs scripts/check-prepared.mjs scripts/build-prepared.mjs tests/regression/reader-engine-architecture.test.ts package.json package-lock.json
git commit -m "feat: extract pure reader engine"
```

### Task 11: Build Web Reader Adapters and Reader Features

**Files:**
- Create: `apps/web-next/src/features/read-chapter/lib/chapter-loader-adapter.ts`
- Create: `apps/web-next/src/features/read-chapter/lib/indexeddb-reader-cache.ts`
- Create: `apps/web-next/src/features/read-chapter/lib/reading-anchor.ts`
- Create: `apps/web-next/src/features/read-chapter/lib/reading-position-storage.ts`
- Create: `apps/web-next/src/features/read-chapter/lib/reading-continuity-storage.ts`
- Create: `apps/web-next/src/features/read-chapter/model/use-reader-controller.ts`
- Create: `apps/web-next/src/features/read-chapter/model/use-reader-progress.ts`
- Create: `apps/web-next/src/features/read-chapter/model/use-swipe-chapter-navigation.ts`
- Create: `apps/web-next/src/features/read-chapter/ui/ReaderOfflineBanner.tsx`
- Create: `apps/web-next/src/features/read-chapter/index.ts`
- Create: `apps/web-next/src/features/reader-preferences/model/preferences.ts`
- Create: `apps/web-next/src/features/reader-preferences/model/ReaderPreferencesProvider.tsx`
- Create: `apps/web-next/src/features/reader-preferences/ui/ReaderPreferencesSheet.tsx`
- Create: `apps/web-next/src/features/reader-preferences/ui/reader-theme.css`
- Create: `apps/web-next/src/features/reader-preferences/index.ts`
- Create: `apps/web-next/src/features/select-chapter/index.ts`
- Create: `apps/web-next/src/features/select-chapter/ui/ChapterListSheet.tsx`
- Create: `tests/regression/web-next-reader-adapters.test.ts`

**Interfaces:**
- Consumes: `@novel-tool/reader-engine`, chapter entity public API, IndexedDB, localStorage, React, and route-navigation callbacks injected by the page.
- Produces: `useReaderController`, persistent chapter cache, reading continuity/position adapters, preferences provider, and reader action UI.

- [ ] **Step 1: Write failing adapter-boundary tests**

```ts
test('web reader controller delegates window and loading behavior to reader-engine', async () => {
  const source = await readFile(
    'apps/web-next/src/features/read-chapter/model/use-reader-controller.ts',
    'utf8'
  );
  assert.match(source, /createReaderSession/);
  assert.doesNotMatch(source, /function trimAroundActive|class ReaderChapterSource/);
});

test('reader persistence and browser globals remain outside the package', async () => {
  const engine = await readTree('packages/reader-engine/src');
  const feature = await readTree('apps/web-next/src/features/read-chapter');
  assert.doesNotMatch(engine, /indexedDB|localStorage|navigator/);
  assert.match(feature, /indexedDB/);
  assert.match(feature, /localStorage/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-reader-adapters.test.ts`.

Expected: missing web adapters.

- [ ] **Step 3: Implement browser and React adapters**

Adapt the public chapter-entity `getChapter` read function to `ReaderChapterLoader` and map transport `Chapter` to the engine identity without teaching the engine HTTP types; the feature adapter does not call HTTP directly. Keep IndexedDB version/content-version invalidation, bounded disk pruning, quota retry, reading-position versioning, continuation history, swipe/keyboard intents, and scroll-anchor calculations in feature-owned adapters. `useReaderController` subscribes to session snapshots and accepts callbacks `onActiveIndexChange(index)` and `onNavigate(index)` instead of importing the router.

Move all extracted `data-reader-*`, reader typography, reader motion, and reader layout rules into `reader-theme.css`, loaded through the feature public API.

- [ ] **Step 4: Run reader adapter, engine, FSD, and type checks**

```powershell
node --import tsx --test tests/regression/web-next-reader-adapters.test.ts
npm run test -w @novel-tool/reader-engine
npm run check:reader-engine-arch
npm run check:web-next-arch
npm run check:web-next
```

Expected: engine and adapters pass with browser concerns only in `web-next`.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/features/read-chapter apps/web-next/src/features/reader-preferences apps/web-next/src/features/select-chapter tests/regression/web-next-reader-adapters.test.ts
git commit -m "feat: add v3 reader adapters"
```

### Task 12: Port the App Shell, Providers, Router, and Navigation Widgets

**Files:**
- Create: `apps/web-next/src/app/i18n/app-messages.en.ts`
- Create: `apps/web-next/src/app/i18n/app-messages.vi.ts`
- Create: `apps/web-next/src/app/i18n/catalog.ts`
- Create: `apps/web-next/src/app/i18n/error-catalog.ts`
- Create: `apps/web-next/src/app/layouts/AppScrollViewport.tsx`
- Create: `apps/web-next/src/app/layouts/AppShell.tsx`
- Create: `apps/web-next/src/app/layouts/AppSidebar.tsx`
- Create: `apps/web-next/src/app/layouts/ReaderShell.tsx`
- Create: `apps/web-next/src/app/providers/ErrorBoundaryProvider.tsx`
- Create: `apps/web-next/src/app/providers/MaintenanceProvider.tsx`
- Create: `apps/web-next/src/app/providers/QueryProvider.tsx`
- Create: `apps/web-next/src/app/router/HomeRedirect.tsx`
- Create: `apps/web-next/src/app/router/route-preload.ts`
- Modify: `apps/web-next/src/app/router/AppRouter.tsx`
- Modify: `apps/web-next/src/app/providers/AppProviders.tsx`
- Modify: `apps/web-next/src/main.tsx`
- Create: `apps/web-next/src/widgets/app-header/index.ts`
- Create: `apps/web-next/src/widgets/app-header/ui/AppHeader.tsx`
- Create: `apps/web-next/src/widgets/bottom-tabs/index.ts`
- Create: `apps/web-next/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx`
- Create: `tests/regression/web-next-app-shell.test.ts`

**Interfaces:**
- Consumes: shared providers/primitives, `AddNovelProvider`, app realtime, reader preferences, public widgets/pages, and current route behavior.
- Produces: the complete V3 provider order, route table, persistent navigation shell, route preloading, and feature-composed global add overlay.

- [ ] **Step 1: Write failing shell ownership and route tests**

```ts
test('web-next preserves the public route table and keeps mutations out of app', async () => {
  const router = await readFile('apps/web-next/src/app/router/AppRouter.tsx', 'utf8');
  for (const route of [
    '/library', '/library/:novelId', 'read/:chapterIndex', '/activity',
    '/activity/:taskId', '/sources', '/sources/new', '/sources/:pluginId', '/settings'
  ]) assert.match(router, new RegExp(escapeRegExp(route)));
  const app = await readTree('apps/web-next/src/app');
  assert.doesNotMatch(
    app,
    /useMutation|method:\s*['"]POST|method:\s*['"]PUT|method:\s*['"]PATCH|method:\s*['"]DELETE/
  );
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-app-shell.test.ts`.

Expected: missing route table and layouts.

- [ ] **Step 3: Port shell behavior without product logic**

Preserve current provider ordering, cache restore before mount, persistence after mount, route-level lazy loading, one shell-level `Suspense`, synchronous home redirect, navigation intent preloading, mobile bottom navigation, desktop sidebar, safe-area layout, skip link, and reader shell nesting. App injects a persistence policy that retains only novel lists, task summary, scheduler status, and source-plugin list while excluding chapter content and task events. App catalog contains global navigation and generic shell copy only; slice EN/VI catalogs and typed product-error translators are merged through public slice exports in `app/i18n`.

Compose `<AddNovelOverlay />` from `features/add-novel`; do not reimplement its state or mutation in the layout.

- [ ] **Step 4: Run shell, startup, and architecture tests**

```powershell
node --import tsx --test tests/regression/web-next-app-shell.test.ts
node --test apps/web/tests/startup-layout-stability.test.mjs apps/web/tests/cache-prefetch-phase3.test.mjs
npm run check:web-next-arch
npm run check:web-next
```

Expected: shell behavior matches the current acceptance rules and compiles.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/app apps/web-next/src/main.tsx apps/web-next/src/widgets/app-header apps/web-next/src/widgets/bottom-tabs tests/regression/web-next-app-shell.test.ts
git commit -m "feat: port v3 application shell"
```

### Task 13: Port Library, Activity, and Task Detail Screens

**Files:**
- Create: `apps/web-next/src/widgets/continue-reading/`
- Create: `apps/web-next/src/widgets/library-grid/`
- Create: `apps/web-next/src/widgets/crawl-task-card/`
- Create: `apps/web-next/src/pages/library/`
- Create: `apps/web-next/src/pages/activity/`
- Create: `apps/web-next/src/pages/task-detail/`
- Create: `tests/regression/web-next-library-activity-pages.test.ts`

**Interfaces:**
- Consumes: novel/task entity hooks, add/filter/search/task-control feature public APIs, reader continuity public API, and shared UI.
- Produces: `/library`, `/activity`, and `/activity/:taskId` parity screens with route state and composition only.

- [ ] **Step 1: Write failing page-ownership and behavior tests**

```ts
test('library page composes public slices and owns only URL/view state', async () => {
  const source = await readTree('apps/web-next/src/pages/library');
  assert.match(source, /useNovels/);
  assert.match(source, /LibraryGrid/);
  assert.match(source, /SearchLibrary/);
  assert.doesNotMatch(source, /useQuery\(|useMutation\(|http\(|queryKeys/);
});

test('task detail composes separate pause resume and cancel features', async () => {
  const source = await readTree('apps/web-next/src/pages/task-detail');
  assert.match(source, /PauseTask/);
  assert.match(source, /ResumeTask/);
  assert.match(source, /CancelTask/);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --import tsx --test tests/regression/web-next-library-activity-pages.test.ts`.

Expected: pages and widgets are missing.

- [ ] **Step 3: Port the three screen capabilities**

Preserve library pagination/filter URL state, 12-card skeleton geometry, continue-reading matching without detail fallbacks, stable search position, disconnected-only polling fallback, activity task grouping, task outcome display, event timeline, progress telemetry, and action loading/disabled behavior. Widgets import only public feature/entity APIs and expose their own `index.ts`.

- [ ] **Step 4: Run page, performance, and FSD tests**

```powershell
node --import tsx --test tests/regression/web-next-library-activity-pages.test.ts
node --test apps/web/tests/network-efficiency-phase2.test.mjs apps/web/tests/task-refresh-stability.test.mjs
npm run check:web-next-arch
npm run check:web-next
```

Expected: page boundaries, polling behavior, and visual-state contracts pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/pages/library apps/web-next/src/pages/activity apps/web-next/src/pages/task-detail apps/web-next/src/widgets/continue-reading apps/web-next/src/widgets/library-grid apps/web-next/src/widgets/crawl-task-card tests/regression/web-next-library-activity-pages.test.ts
git commit -m "feat: port v3 library and activity screens"
```

### Task 14: Port Novel Detail and Reader Screens

**Files:**
- Create: `apps/web-next/src/widgets/reader-toolbar/`
- Create: `apps/web-next/src/widgets/reader-progress/`
- Create: `apps/web-next/src/widgets/reader-bottom-bar/`
- Create: `apps/web-next/src/pages/novel-detail/`
- Create: `apps/web-next/src/pages/chapter-reader/`
- Create: `tests/regression/web-next-reader-pages.test.ts`
- Create: `tests/e2e/web-next-reader-parity.spec.ts`

**Interfaces:**
- Consumes: novel/chapter/task entities, novel action features, scheduler feature, export feature, reader controller/preferences/select-chapter features, and route callbacks.
- Produces: `/library/:novelId` and `/library/:novelId/read/:chapterIndex` parity screens.

- [ ] **Step 1: Write failing delegation and bounded-render tests**

```ts
test('reader page delegates persistence and infinite loading to features', async () => {
  const source = await readTree('apps/web-next/src/pages/chapter-reader');
  assert.match(source, /useReaderController/);
  assert.doesNotMatch(source, /indexedDB|localStorage|createReaderSession|trimAroundActive/);
});

test('reader engine window never renders more than five chapters', async ({ page }) => {
  await installReaderMocks(page, { chapters: 20 });
  await page.goto('/library/novel-1/read/10');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('[data-reader-chapter]')).toHaveCount(5);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --import tsx --test tests/regression/web-next-reader-pages.test.ts
npx playwright test tests/e2e/web-next-reader-parity.spec.ts --config playwright.web-next.config.ts
```

Expected: pages/config are not complete.

- [ ] **Step 3: Port detail and immersive reading composition**

Preserve detail route parsing, management sheet, chapter status/error rendering, automatic update controls, export, last-position return, detail scroll restoration, reader scroll anchoring, previous/next/swipe/keyboard navigation, wake lock, auto-hiding chrome, offline banner, reader preferences, chapter list sheet, and continuity history. The page converts route params and wires callbacks; engine/session and persistence logic remain below the page.

- [ ] **Step 4: Run reader unit, regression, and browser checks**

```powershell
npm run test -w @novel-tool/reader-engine
node --import tsx --test tests/regression/web-next-reader-pages.test.ts tests/regression/reader-controls.test.ts tests/regression/reading-continuity.test.ts tests/regression/reading-position.test.ts
npx playwright test tests/e2e/web-next-reader-parity.spec.ts --config playwright.web-next.config.ts
npm run check:web-next-arch
```

Expected: navigation, offline cache, restoration, cancellation, and bounded rendering pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/pages/novel-detail apps/web-next/src/pages/chapter-reader apps/web-next/src/widgets/reader-toolbar apps/web-next/src/widgets/reader-progress apps/web-next/src/widgets/reader-bottom-bar tests/regression/web-next-reader-pages.test.ts tests/e2e/web-next-reader-parity.spec.ts
git commit -m "feat: port v3 novel and reader screens"
```

### Task 15: Port Sources and Settings, Prove Browser Parity, and Complete Frontend Verification

**Files:**
- Create: `apps/web-next/src/widgets/source-reader-overview/`
- Create: `apps/web-next/src/widgets/source-plugin-details/`
- Create: `apps/web-next/src/widgets/source-credentials-panel/`
- Create: `apps/web-next/src/widgets/source-network-profiles-panel/`
- Create: `apps/web-next/src/widgets/source-auth-challenges-panel/`
- Create: `apps/web-next/src/widgets/source-inspector/`
- Create: `apps/web-next/src/widgets/system-health/`
- Create: `apps/web-next/src/pages/sources/`
- Create: `apps/web-next/src/pages/settings/`
- Create: `playwright.web-next.config.ts`
- Create: `scripts/lib/web-contracts.mjs`
- Create: `scripts/check-web-next-contracts.mjs`
- Create: `tests/e2e/web-next-semantic-parity.spec.ts`
- Create: `tests/regression/web-next-http-contract-guard.test.ts`
- Create: `tests/regression/web-next-completion.test.ts`
- Modify: `scripts/check-web-contracts.mjs`
- Modify: `tests/e2e/library-loading-stability.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all completed entity/feature/widget public APIs, current page markup/copy as the visual oracle, and API-next on port `3100`.
- Produces: complete Sources/Settings parity, base-URL-neutral browser tests, `test:e2e:web-next`, and `verify:v3:frontend`.

- [ ] **Step 1: Write failing completion and semantic-parity tests**

```ts
test('every frontend slice has a public index and no external deep import', async () => {
  assert.deepEqual(await checkWebNextArchitecture(process.cwd()), []);
  for (const route of ['/library', '/activity', '/sources', '/settings']) {
    assert.equal(await routeExists('apps/web-next/src/app/router/AppRouter.tsx', route), true);
  }
});

test('web contract checker accepts both frontend roots independently', async () => {
  assert.deepEqual(await checkWebContracts('apps/web/src'), []);
  assert.deepEqual(await checkWebContracts('apps/web-next/src'), []);
});

test('current and next mobile screens expose the same primary landmarks', async ({ browser }) => {
  const current = await browser.newPage();
  const next = await browser.newPage();
  await installParityMocks(current);
  await installParityMocks(next);
  await current.goto('http://127.0.0.1:4173/library');
  await next.goto('http://127.0.0.1:4174/library');
  expect(await primaryLandmarks(next)).toEqual(await primaryLandmarks(current));
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --import tsx --test tests/regression/web-next-completion.test.ts
npx playwright test tests/e2e/web-next-semantic-parity.spec.ts --config playwright.web-next.config.ts
```

Expected: Sources/Settings and dual preview configuration are incomplete.

- [ ] **Step 3: Port final screens and add the frontend gate**

Port Sources section URL state, plugin detail route, credentials/network/challenges/inspector panels, all optimistic/error/secret-safe UI, Settings hub/sheets, appearance/language/reader controls, scheduler health, backup/restore, search rebuild, version/build display, and mobile/desktop layouts. Every widget exposes `index.ts`; pages import only public slice APIs.

Configure Playwright with two web servers (`@novel-tool/web` on `4173`, `@novel-tool/web-next` on `4174`) and next as the default `baseURL`. Change hardcoded `http://127.0.0.1:3000/api/...` intercepts to `**/api/...` so the same browser specs run against either backend base. Refactor the current frontend contract checker into `checkWebContracts(webRoot)` and keep the current CLI; add a next CLI so both roots enforce canonical envelopes, error-code types, endpoint names, Source Reader routes, and build metadata.

Add root scripts:

```json
{
  "check:web-next-contracts": "node scripts/check-web-next-contracts.mjs",
  "test:e2e:web-next": "playwright test --config playwright.web-next.config.ts",
  "verify:v3:frontend": "npm run prepare:packages && npm run check:web-next-arch && npm run check:web-next-contracts && npm run check:reader-engine-arch && npm run check -w @novel-tool/reader-engine && npm run test -w @novel-tool/reader-engine && npm run check:web-next && npm run build:web && npm run build:web-next && npm run test:regression && npm run test:e2e:web-next"
}
```

- [ ] **Step 4: Run complete frontend verification**

```powershell
npm run verify:v3:frontend
npm run verify:v3:backend
node scripts/check-docs.mjs
```

Expected: current and next frontends build, all semantic/mobile/reader/Source Reader browser tests pass, backend parity remains green, and docs pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/web-next/src/widgets apps/web-next/src/pages/sources apps/web-next/src/pages/settings scripts/lib/web-contracts.mjs scripts/check-web-contracts.mjs scripts/check-web-next-contracts.mjs playwright.web-next.config.ts tests/e2e tests/regression/web-next-http-contract-guard.test.ts tests/regression/web-next-completion.test.ts package.json package-lock.json
git commit -m "feat: complete v3 frontend parity"
```

## Subproject 3 Completion Gate

Run fresh:

```powershell
npm run verify:v3:frontend
npm run verify:v3:backend
npm run check
git status --short
```

Required result:

- `apps/web` remains runnable on `5173`; `apps/web-next` remains runnable on `5174` against API-next `3100`.
- The TypeScript-AST guard reports no upward import, cross-slice import, deep slice import, missing public index, shared domain ownership, or app/page mutation.
- Entity reads/query keys and feature writes/invalidation policies are owned by the correct slices.
- Realtime domain routing exists only in `app/realtime` and calls entity public invalidation adapters.
- Reader engine tests prove bounded windows, cache ordering, stale identity rejection, cancellation, retry, and session replacement without browser/framework imports.
- Existing mobile Chromium flows and new semantic parity flows pass without Source Reader secret leakage or visual redesign.
- No unrelated user changes are staged.
