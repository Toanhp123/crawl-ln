# Novel Tool V3 Subproject 1: Contract Freeze and Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze current external behavior and build a runnable `api-next` foundation with trusted actor identity, module-owned migrations, architecture enforcement, and recoverable event infrastructure.

**Architecture:** The current API remains the behavioral oracle. `apps/api-next` starts as a separate Express application and introduces the platform primitives used by all V3 modules. Library and Ingestion receive only contracts, domain skeletons, and initial module-owned schemas in this subproject; capability migration happens in Subproject 2.

**Tech Stack:** Node.js 22.12+, TypeScript 5.5, Express 4, Zod 3, Node `DatabaseSync`, npm workspaces, Node test runner, `tsx`.

## Global Constraints

- Node.js remains `>=22.12.0`.
- npm remains `>=10` with a portable public-registry lockfile.
- HTTP success and error responses retain the canonical `{ data, error }` envelope.
- Existing 204 and binary endpoint semantics remain unchanged.
- The V3 implementation must import existing schema-version-22 databases without changing record IDs.
- Existing Source Plugin SDK capability contract version `1` and sandbox protocol version `1` remain supported.
- Local-first operation and Termux support remain product requirements.
- Current `apps/api` and `apps/web` remain runnable until cutover acceptance is complete.
- Every production change follows RED -> GREEN -> REFACTOR; do not write production code before the failing test.
- Do not stage or alter unrelated user changes in `package-lock.json` or Termux scripts.

---

## Locked Interfaces Produced by This Plan

Later subprojects consume these exact interfaces:

```ts
export interface ModuleMigration {
  module: string;
  version: number;
  up(database: DatabaseSync): void;
}

export interface ApplicationEvent<TPayload = unknown> {
  id: string;
  type: string;
  occurredAt: string;
  payload: TPayload;
}

export interface OutboxSource {
  claimBatch(limit: number): Promise<ApplicationEvent[]>;
  markDelivered(ids: string[], deliveredAt: string): Promise<void>;
}

export interface LibraryCommands {
  reconcileAnalysis(command: ReconcileAnalysisCommand): Promise<LibraryNovelDetail>;
  saveChapterContent(command: SaveChapterContentCommand): Promise<LibraryChapter>;
  setIngestionState(command: SetLibraryIngestionStateCommand): Promise<void>;
  deleteNovel(command: DeleteLibraryNovelCommand): Promise<void>;
}

export interface LibraryQueries {
  listNovels(query: ListLibraryNovelsQuery): Promise<PaginatedLibraryNovels>;
  getNovel(id: string): Promise<LibraryNovelDetail | null>;
  getChapter(novelId: string, chapterIndex: number): Promise<LibraryChapter | null>;
  getStats(): Promise<LibraryStats>;
}

export interface IngestionCommands {
  analyzeNovel(command: AnalyzeNovelCommand): Promise<LibraryNovelDetail>;
  createJob(command: CreateIngestionJobCommand): Promise<IngestionJob>;
  pauseJob(command: JobIdentityCommand): Promise<void>;
  resumeJob(command: JobIdentityCommand): Promise<void>;
  cancelJob(command: JobIdentityCommand): Promise<void>;
  refreshNovel(command: RefreshNovelCommand): Promise<IngestionJob | null>;
}

export interface IngestionQueries {
  listJobs(query: ListIngestionJobsQuery): Promise<IngestionJob[]>;
  getJob(id: string): Promise<IngestionJob | null>;
  getJobEvents(id: string): Promise<IngestionEvent[]>;
  getNovelJob(novelId: string): Promise<IngestionJob | null>;
  getSummary(): Promise<IngestionSummary>;
}
```

### Task 1: Backport the Trusted Actor Model to the Current API

**Files:**
- Modify: `apps/api/src/modules/source-reader/presentation/source-reader-actor.middleware.ts`
- Modify: `tests/regression/source-reader-authorization.test.ts`
- Modify: `README.md`
- Modify: `docs/SOURCE_READER.md`

**Interfaces:**
- Consumes: existing `ApiAccessClassification`, `SOURCE_READER_LOCAL_ADMIN`, and `SOURCE_READER_TRUST_ROLE_HEADERS` behavior.
- Produces: local actor ID `local-user`; remote identity and roles trusted only when `trustRoleHeaders=true` and API access is authenticated.

- [ ] **Step 1: Write failing actor middleware tests**

Add these cases to `tests/regression/source-reader-authorization.test.ts`:

```ts
test('local requests receive a stable actor identity without headers', () => {
  const request = {
    apiAccess: { isLocal: true, authenticated: true },
    header: () => undefined
  };
  sourceReaderActorMiddleware({ localAdminEnabled: false, trustRoleHeaders: false })(
    request as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((request as { sourceReaderActor?: unknown }).sourceReaderActor, {
    id: 'local-user',
    roles: ['reader']
  });
});

test('untrusted remote requests cannot assert a user identity', () => {
  const request = actorRequest({ isLocal: false, authenticated: true });
  sourceReaderActorMiddleware({ localAdminEnabled: false, trustRoleHeaders: false })(
    request as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((request as { sourceReaderActor?: unknown }).sourceReaderActor, {
    roles: ['reader']
  });
});

test('trusted authenticated remote requests may assert identity and roles', () => {
  const request = actorRequest({ isLocal: false, authenticated: true, roles: 'source-manager' });
  sourceReaderActorMiddleware({ localAdminEnabled: false, trustRoleHeaders: true })(
    request as never,
    {} as never,
    () => undefined
  );
  assert.deepEqual((request as { sourceReaderActor?: unknown }).sourceReaderActor, {
    id: 'user-1',
    roles: ['source-manager']
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --import tsx --test tests/regression/source-reader-authorization.test.ts
```

Expected: the local identity assertion fails because the actor ID is absent, and the untrusted remote assertion fails because `user-1` is currently accepted.

- [ ] **Step 3: Implement the trusted actor derivation**

Replace unconditional identity extraction with this policy:

```ts
const requestedId = request.header('x-source-reader-user-id') || undefined;
const trustedRemoteActor =
  !access.isLocal && options.trustRoleHeaders && access.authenticated;
const id = access.isLocal ? requestedId ?? 'local-user' : trustedRemoteActor ? requestedId : undefined;
```

Keep existing role behavior, but use `trustedRemoteActor` for the remote role branch. Construct the actor with `...(id ? { id } : {})`.

Document that `SOURCE_READER_TRUST_ROLE_HEADERS=true` trusts both actor identity and roles from an authenticated remote client. Document `local-user` as the default local owner.

- [ ] **Step 4: Run focused and integration authorization tests**

Run:

```powershell
node --import tsx --test tests/regression/source-reader-authorization.test.ts
node --experimental-sqlite --import tsx --test tests/integration/source-reader-admin-http.test.ts
```

Expected: both files pass with zero failures.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/source-reader/presentation/source-reader-actor.middleware.ts tests/regression/source-reader-authorization.test.ts README.md docs/SOURCE_READER.md
git commit -m "fix: trust source reader actor identity explicitly"
```

### Task 2: Create a Reusable HTTP Contract Harness

**Files:**
- Create: `tests/contract/http-contract.types.ts`
- Create: `tests/contract/http-server.harness.ts`
- Create: `tests/contract/current-api.runtime.ts`
- Create: `tests/contract/core-http-contract.test.ts`
- Modify: `scripts/run-test-files.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: current `createAppRuntime({ startBackgroundServices: false })`.
- Produces: `HttpContractRuntime`, `withContractServer`, and a `contract` test suite reusable by `api-next`.

- [ ] **Step 1: Write a failing contract-harness test**

Create `tests/contract/core-http-contract.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { currentApiRuntime } from './current-api.runtime.ts';
import { withContractServer } from './http-server.harness.ts';

test('current API exposes canonical health and JSON 404 contracts', async () => {
  await withContractServer(currentApiRuntime, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { data: { ok: true, name: 'novel-tool' }, error: null });

    const missing = await fetch(`${baseUrl}/api/not-a-route`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      data: null,
      error: { code: 'NOT_FOUND', message: 'Route not found', details: null }
    });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-sqlite --import tsx --test tests/contract/core-http-contract.test.ts
```

Expected: module-not-found failure for `current-api.runtime.ts` or `http-server.harness.ts`.

- [ ] **Step 3: Implement the harness and runtime adapter**

Create `tests/contract/http-contract.types.ts`:

```ts
import type { Express } from 'express';

export interface HttpContractRuntime {
  create(): Promise<{ app: Express; close(): Promise<void> }>;
}
```

Create `tests/contract/http-server.harness.ts`:

```ts
import type { AddressInfo } from 'node:net';
import type { HttpContractRuntime } from './http-contract.types.ts';

export async function withContractServer(
  runtime: HttpContractRuntime,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const instance = await runtime.create();
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    await instance.close();
  }
}
```

Create `tests/contract/current-api.runtime.ts` with a dynamic import after the test environment is configured:

```ts
import type { HttpContractRuntime } from './http-contract.types.ts';

export const currentApiRuntime: HttpContractRuntime = {
  async create() {
    const { createAppRuntime } = await import('../../apps/api/src/app.ts');
    const runtime = createAppRuntime({ startBackgroundServices: false });
    await runtime.ready;
    return { app: runtime.app, close: () => runtime.lifecycle.stop() };
  }
};
```

Add a `contract` suite to `scripts/run-test-files.mjs` using the integration node arguments and add root script `test:contract`.

- [ ] **Step 4: Run the contract suite**

Run:

```powershell
npm run test:contract
```

Expected: all contract files pass and use isolated temporary storage.

- [ ] **Step 5: Commit**

```powershell
git add tests/contract scripts/run-test-files.mjs package.json
git commit -m "test: freeze core http contracts"
```

### Task 3: Freeze a Schema-Version-22 Migration Fixture

**Files:**
- Create: `tests/helpers/v22-database.fixture.ts`
- Create: `tests/contract/v22-database-fixture.test.ts`
- Create: `tests/fixtures/database-v22/expected.json`

**Interfaces:**
- Consumes: current `SqliteDatabase` migration registry and module-owned current repositories.
- Produces: `createV22Fixture(root: string): Promise<V22Fixture>` with stable record IDs and expected counts.

- [ ] **Step 1: Write the failing fixture test**

```ts
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createV22Fixture } from '../helpers/v22-database.fixture.ts';

test('v22 fixture contains stable library, ingestion, scheduler and source-reader records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v22-fixture-'));
  const fixture = await createV22Fixture(root);
  assert.equal(fixture.schemaVersion, 22);
  assert.deepEqual(fixture.ids, {
    novelId: 'fixture-novel',
    chapterId: 'fixture-chapter',
    taskId: 'fixture-task',
    pluginId: 'fixture-plugin'
  });
  assert.deepEqual(fixture.counts, { novels: 1, chapters: 1, tasks: 1, plugins: 1 });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --experimental-sqlite --import tsx --test tests/contract/v22-database-fixture.test.ts
```

Expected: module-not-found failure for `v22-database.fixture.ts`.

- [ ] **Step 3: Implement deterministic fixture creation**

Create the database through the current migration runner, then insert one valid record into each required table inside `transactionSync`. Use exact IDs from the test. Return:

```ts
export interface V22Fixture {
  databasePath: string;
  schemaVersion: 22;
  ids: {
    novelId: 'fixture-novel';
    chapterId: 'fixture-chapter';
    taskId: 'fixture-task';
    pluginId: 'fixture-plugin';
  };
  counts: { novels: 1; chapters: 1; tasks: 1; plugins: 1 };
}
```

Write `expected.json` with the same IDs and counts so later migration tests can compare independently from the fixture implementation.

- [ ] **Step 4: Run fixture and current integration tests**

```powershell
node --experimental-sqlite --import tsx --test tests/contract/v22-database-fixture.test.ts
node --experimental-sqlite --import tsx --test tests/integration/sqlite-transaction.test.ts
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add tests/helpers/v22-database.fixture.ts tests/contract/v22-database-fixture.test.ts tests/fixtures/database-v22/expected.json
git commit -m "test: add deterministic v22 database fixture"
```

### Task 4: Scaffold the Runnable `api-next` Application

**Files:**
- Create: `apps/api-next/package.json`
- Create: `apps/api-next/tsconfig.json`
- Create: `apps/api-next/src/main.ts`
- Create: `apps/api-next/src/app.ts`
- Create: `apps/api-next/src/platform/http/api-response.ts`
- Create: `apps/api-next/src/platform/http/not-found.middleware.ts`
- Create: `apps/api-next/src/platform/http/error.middleware.ts`
- Create: `apps/api-next/src/platform/config/environment.ts`
- Create: `tests/contract/api-next.runtime.ts`
- Modify: `tests/contract/core-http-contract.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `HttpContractRuntime` and `@novel-tool/shared` transport contracts.
- Produces: `createNextAppRuntime()` and a standalone API listening on `NEXT_API_PORT` default `3100`.

- [ ] **Step 1: Add a failing parity test for both runtimes**

Refactor `core-http-contract.test.ts` to iterate over current and next runtimes:

```ts
for (const [name, runtime] of [
  ['current', currentApiRuntime],
  ['next', nextApiRuntime]
] as const) {
  test(`${name} API exposes canonical health and JSON 404 contracts`, async () => {
    await withContractServer(runtime, assertCoreHttpContract);
  });
}
```

- [ ] **Step 2: Run and verify RED**

Run `npm run test:contract`.

Expected: failure because `apps/api-next` and `nextApiRuntime` do not exist.

- [ ] **Step 3: Implement the minimal application**

Use this public runtime:

```ts
export interface NextAppRuntime {
  app: Express;
  ready: Promise<void>;
  lifecycle: { stop(): Promise<void> };
}

export function createNextAppRuntime(): NextAppRuntime {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_request, response) => ok(response, { ok: true, name: 'novel-tool' }));
  app.use('/api', notFoundMiddleware);
  app.use(errorMiddleware);
  return { app, ready: Promise.resolve(), lifecycle: { stop: async () => undefined } };
}
```

Add workspace scripts `dev:api-next`, `check:api-next`, and `build:api-next`. Keep existing default scripts unchanged.

- [ ] **Step 4: Run contract and TypeScript checks**

```powershell
npm run test:contract
npm run check:api-next
```

Expected: both runtimes pass the same core HTTP contract and `tsc` exits 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next tests/contract package.json package-lock.json
git commit -m "feat: scaffold v3 api runtime"
```

### Task 5: Add the API-Next Architecture Checker

**Files:**
- Create: `scripts/lib/api-next-architecture.mjs`
- Create: `scripts/check-api-next-architecture.mjs`
- Create: `tests/regression/api-next-architecture-guard.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: TypeScript compiler API from the workspace TypeScript dependency.
- Produces: `checkApiNextArchitecture(root): Promise<string[]>` and `npm run check:api-next-arch`.

- [ ] **Step 1: Write failing guard tests using temporary fixtures**

Cover these violations independently:

```ts
test('guard rejects cross-module internal imports', async () => {
  const root = await fixture({
    'modules/library/application/read.ts':
      "import '../ingestion/infrastructure/sqlite/repository.js';"
  });
  assert.match((await checkApiNextArchitecture(root)).join('\n'), /cross-module internal import/);
});

test('guard rejects foreign module table prefixes', async () => {
  const root = await fixture({
    'modules/library/infrastructure/sqlite/repository.ts':
      "const sql = 'UPDATE ingestion_jobs SET status=?';"
  });
  assert.match((await checkApiNextArchitecture(root)).join('\n'), /foreign table prefix/);
});

test('guard rejects deep composition behavior', async () => {
  const root = await fixture({
    'bootstrap/container.ts': 'const jobs = await repository.list();'
  });
  assert.match((await checkApiNextArchitecture(root)).join('\n'), /composition behavior/);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --import tsx --test tests/regression/api-next-architecture-guard.test.ts
```

Expected: module-not-found for the checker library.

- [ ] **Step 3: Implement AST and SQL ownership checks**

The checker must:

- Resolve static imports, exports, dynamic imports, aliases, and relative paths using TypeScript resolution.
- Enforce `presentation -> application -> domain` and infrastructure-to-port direction.
- Permit cross-module imports only when the resolved target contains `/public/`.
- Permit `@novel-tool/shared` only under presentation and explicitly listed binary HTTP adapters.
- Extract string literals and template literals containing SQL keywords; compare table prefixes against module ownership.
- Reject `REFERENCES` clauses whose target table belongs to another module, so cross-module foreign keys cannot bypass the prefix rule.
- Reject `await`, repository method calls, domain conditionals, and anonymous application executors in `src/bootstrap`.
- Require every module to expose `public/<module>.api.ts` and `index.ts`.

Export the checker for tests and make the CLI print unique violations before exiting 1.

- [ ] **Step 4: Run guard tests and the real checker**

```powershell
node --import tsx --test tests/regression/api-next-architecture-guard.test.ts
npm run check:api-next-arch
```

Expected: fixture violations are detected, and the real scaffold has zero violations.

- [ ] **Step 5: Commit**

```powershell
git add scripts/lib/api-next-architecture.mjs scripts/check-api-next-architecture.mjs tests/regression/api-next-architecture-guard.test.ts package.json
git commit -m "test: enforce v3 backend architecture"
```

### Task 6: Implement Module-Owned Migration Registration

**Files:**
- Create: `apps/api-next/src/platform/database/sqlite-database.ts`
- Create: `apps/api-next/src/platform/database/module-migration.ts`
- Create: `apps/api-next/src/platform/database/migration-registry.ts`
- Create: `apps/api-next/src/platform/database/migration-runner.ts`
- Create: `tests/integration/api-next-migration-registry.test.ts`

**Interfaces:**
- Consumes: Node `DatabaseSync`.
- Produces: `ModuleMigration`, `MigrationRegistry`, `runRegisteredMigrations`, and `SqliteDatabase.transactionSync`.

- [ ] **Step 1: Write failing migration-order and rollback tests**

```ts
test('registered module migrations run once in deterministic order', () => {
  const database = new SqliteDatabase(':memory:');
  const registry = new MigrationRegistry();
  registry.register('library', [migration('library', 2), migration('library', 1)]);
  registry.register('ingestion', [migration('ingestion', 1)]);
  runRegisteredMigrations(database, registry);
  assert.deepEqual(applied(database), [
    ['ingestion', 1],
    ['library', 1],
    ['library', 2]
  ]);
  runRegisteredMigrations(database, registry);
  assert.equal(executionCount, 3);
});

test('failed module migration rolls back its schema record and SQL', () => {
  const database = new SqliteDatabase(':memory:');
  const registry = new MigrationRegistry();
  registry.register('library', [{
    module: 'library', version: 1,
    up(db) { db.exec('CREATE TABLE library_temp(id TEXT);'); throw new Error('stop'); }
  }]);
  assert.throws(() => runRegisteredMigrations(database, registry), /stop/);
  assert.equal(tableExists(database, 'library_temp'), false);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-migration-registry.test.ts
```

Expected: module-not-found for the database platform files.

- [ ] **Step 3: Implement the migration platform**

Use this migration record table:

```sql
CREATE TABLE IF NOT EXISTS platform_module_migrations (
  module_name TEXT NOT NULL,
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY(module_name, version)
);
```

`MigrationRegistry.register` rejects duplicate module/version pairs. `runRegisteredMigrations` sorts by module then version and wraps each migration plus schema record in `transactionSync`.

- [ ] **Step 4: Run migration and architecture tests**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-migration-registry.test.ts
npm run check:api-next-arch
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/platform/database tests/integration/api-next-migration-registry.test.ts
git commit -m "feat: add module-owned migration platform"
```

### Task 7: Add Event Bus and Recoverable Outbox Dispatch

**Files:**
- Create: `apps/api-next/src/platform/events/application-event.ts`
- Create: `apps/api-next/src/platform/events/event-bus.ts`
- Create: `apps/api-next/src/platform/events/in-memory-event-bus.ts`
- Create: `apps/api-next/src/platform/events/outbox-source.ts`
- Create: `apps/api-next/src/platform/events/outbox-dispatcher.ts`
- Create: `tests/regression/api-next-outbox-dispatcher.test.ts`

**Interfaces:**
- Consumes: `ClockPort`, `LoggerPort`, and module-owned `OutboxSource` registrations.
- Produces: typed in-process event subscription and bounded outbox draining.

- [ ] **Step 1: Write failing dispatch behavior tests**

```ts
test('dispatcher marks only successfully published events as delivered', async () => {
  const source = new FakeOutboxSource([event('one'), event('two')]);
  const bus = new FakeEventBus({ failOn: 'two' });
  const dispatcher = new OutboxDispatcher([source], bus, clock, logger, { batchSize: 10 });
  await dispatcher.tick();
  assert.deepEqual(source.deliveredIds, ['one']);
  assert.deepEqual(source.pendingIds, ['two']);
});

test('dispatcher ignores an empty source without busy looping', async () => {
  const source = new FakeOutboxSource([]);
  const dispatcher = new OutboxDispatcher([source], new FakeEventBus(), clock, logger);
  assert.equal(await dispatcher.tick(), 0);
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --import tsx --test tests/regression/api-next-outbox-dispatcher.test.ts
```

Expected: module-not-found for `OutboxDispatcher`.

- [ ] **Step 3: Implement bounded dispatch**

Define:

```ts
export interface EventBus {
  publish(event: ApplicationEvent): Promise<void>;
  subscribe<T>(type: string, handler: (event: ApplicationEvent<T>) => Promise<void>): () => void;
}

export class OutboxDispatcher {
  async tick(): Promise<number>;
  start(intervalMs?: number): void;
  async stop(): Promise<void>;
}
```

`tick` claims at most `batchSize` from each source, publishes sequentially per source, marks each successful ID immediately, logs bounded error metadata, and leaves failed/later events pending. `stop` waits for the active tick.

- [ ] **Step 4: Run focused tests and API-next check**

```powershell
node --import tsx --test tests/regression/api-next-outbox-dispatcher.test.ts
npm run check:api-next
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/platform/events tests/regression/api-next-outbox-dispatcher.test.ts
git commit -m "feat: add recoverable application event dispatch"
```

### Task 8: Define the Library Module Boundary and Initial Schema

**Files:**
- Create: `apps/api-next/src/modules/library/domain/library.models.ts`
- Create: `apps/api-next/src/modules/library/public/library.contracts.ts`
- Create: `apps/api-next/src/modules/library/public/library.api.ts`
- Create: `apps/api-next/src/modules/library/infrastructure/migrations/001-library-schema.ts`
- Create: `apps/api-next/src/modules/library/index.ts`
- Create: `tests/integration/api-next-library-schema.test.ts`

**Interfaces:**
- Consumes: `ModuleMigration`.
- Produces: locked `LibraryCommands`, `LibraryQueries`, and `libraryMigrations` used by Subproject 2.

- [ ] **Step 1: Write failing schema ownership tests**

```ts
test('library migration creates only library-owned tables', () => {
  const database = migrateWith(libraryMigrations);
  assert.deepEqual(listTables(database).filter((name) => !name.startsWith('platform_')), [
    'library_chapters',
    'library_command_receipts',
    'library_novels',
    'library_outbox'
  ]);
});

test('library public API exposes commands and queries without infrastructure types', () => {
  assertType<LibraryApi>({ commands: fakeCommands, queries: fakeQueries });
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-library-schema.test.ts
```

Expected: missing Library module files.

- [ ] **Step 3: Implement contracts and schema migration**

Define these core command shapes in `library.contracts.ts`:

```ts
export interface ReconcileAnalysisCommand {
  commandId: string;
  analyzedAt: string;
  novel: {
    id: string;
    title: string;
    sourceUrl: string;
    sourceName: string;
    author?: string;
    coverUrl?: string;
  };
  chapters: Array<{ id: string; index: number; title: string; sourceUrl: string }>;
}

export interface SaveChapterContentCommand {
  commandId: string;
  novelId: string;
  chapterId: string;
  title: string;
  rawText: string;
  cleanText: string;
  savedAt: string;
}
```

Create tables using only the `library_` prefix. Include unique source URL constraints, stable chapter identity, content version, command receipt primary key, and module outbox table.

- [ ] **Step 4: Run schema, architecture, and type checks**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-library-schema.test.ts
npm run check:api-next-arch
npm run check:api-next
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/library tests/integration/api-next-library-schema.test.ts
git commit -m "feat: define v3 library module boundary"
```

### Task 9: Define the Ingestion Module Boundary and Initial Schema

**Files:**
- Create: `apps/api-next/src/modules/ingestion/domain/ingestion.models.ts`
- Create: `apps/api-next/src/modules/ingestion/public/ingestion.contracts.ts`
- Create: `apps/api-next/src/modules/ingestion/public/ingestion.api.ts`
- Create: `apps/api-next/src/modules/ingestion/infrastructure/migrations/001-ingestion-schema.ts`
- Create: `apps/api-next/src/modules/ingestion/index.ts`
- Create: `tests/integration/api-next-ingestion-schema.test.ts`

**Interfaces:**
- Consumes: `LibraryCommands`, `LibraryQueries`, and `ModuleMigration` as type-only dependencies through Library public exports.
- Produces: locked `IngestionCommands`, `IngestionQueries`, and `ingestionMigrations` used by Subproject 2.

- [ ] **Step 1: Write failing boundary and schema tests**

```ts
test('ingestion migration creates only ingestion-owned tables', () => {
  const database = migrateWith(ingestionMigrations);
  assert.deepEqual(listTables(database).filter((name) => !name.startsWith('platform_')), [
    'ingestion_command_receipts',
    'ingestion_events',
    'ingestion_job_chapters',
    'ingestion_jobs',
    'ingestion_outbox'
  ]);
});

test('ingestion contracts keep library references opaque', () => {
  const command: CreateIngestionJobCommand = {
    commandId: 'command-1', novelId: 'novel-1', requestedAt: '2026-07-21T00:00:00.000Z'
  };
  assert.equal(command.novelId, 'novel-1');
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-ingestion-schema.test.ts
```

Expected: missing Ingestion files.

- [ ] **Step 3: Implement contracts and schema**

Define job state and commands:

```ts
export type IngestionJobStatus =
  | 'queued' | 'running' | 'pausing' | 'paused' | 'resuming'
  | 'completed' | 'failed' | 'cancelled';

export interface CreateIngestionJobCommand {
  commandId: string;
  novelId: string;
  requestedAt: string;
}

export interface JobIdentityCommand {
  commandId: string;
  jobId: string;
  requestedAt: string;
}
```

The initial schema stores job counters, outcome, timestamps, ordered chapter IDs, events, command receipts, and outbox rows. It contains no foreign key to Library tables.

- [ ] **Step 4: Run schema and architecture checks**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-ingestion-schema.test.ts
npm run check:api-next-arch
npm run check:api-next
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/ingestion tests/integration/api-next-ingestion-schema.test.ts
git commit -m "feat: define v3 ingestion module boundary"
```

### Task 10: Wire Foundation Modules and Lifecycle

**Files:**
- Create: `apps/api-next/src/bootstrap/app-container.ts`
- Create: `apps/api-next/src/bootstrap/module-registry.ts`
- Create: `apps/api-next/src/modules/library/library.module.ts`
- Create: `apps/api-next/src/modules/ingestion/ingestion.module.ts`
- Modify: `apps/api-next/src/app.ts`
- Modify: `apps/api-next/src/main.ts`
- Create: `tests/integration/api-next-lifecycle.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: module migrations, event bus, outbox dispatcher, and public module interfaces.
- Produces: a composition root containing construction/lifecycle only and the final Subproject 1 verification command.

- [ ] **Step 1: Write failing lifecycle-order tests**

```ts
test('api-next starts migrations before background dispatch and closes in reverse order', async () => {
  const order: string[] = [];
  const runtime = createTestContainer({ order });
  await runtime.start();
  await runtime.stop();
  assert.deepEqual(order, [
    'database.open',
    'migrations.run',
    'outbox.start',
    'outbox.stop',
    'database.close'
  ]);
});

test('composition root exposes only lifecycle and presentation surfaces', () => {
  const container = createAppContainer(testEnvironment());
  assert.deepEqual(Object.keys(container).sort(), ['lifecycle', 'presentation']);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-lifecycle.test.ts
```

Expected: missing bootstrap/container modules.

- [ ] **Step 3: Implement pure wiring and lifecycle**

Use a module registry with this shape:

```ts
export interface RegisteredModule {
  name: string;
  migrations: ModuleMigration[];
  outbox?: OutboxSource;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
```

`createAppContainer` constructs the database, registers Library and Ingestion migrations, builds the event bus/dispatcher, and exposes route placeholders through `presentation`. It contains no repository query, event-resource mapping, or use-case conditional.

Add root script:

```json
"verify:v3:foundation": "npm run check:api-next-arch && npm run check:api-next && npm run test:contract && node --experimental-sqlite --import tsx --test tests/integration/api-next-*.test.ts"
```

- [ ] **Step 4: Run the complete Subproject 1 gate**

```powershell
npm run verify:v3:foundation
npm run check
```

Expected: both commands exit 0; the current API/Web checks remain green.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/bootstrap apps/api-next/src/modules apps/api-next/src/app.ts apps/api-next/src/main.ts tests/integration/api-next-lifecycle.test.ts package.json package-lock.json
git commit -m "feat: complete v3 backend foundation"
```

## Subproject 1 Completion Gate

Run fresh:

```powershell
npm run verify:v3:foundation
npm run check
git status --short
```

Required result:

- All commands exit 0.
- Current API contract tests and API-next core contract tests both pass.
- Actor identity tests prove untrusted remote identity is ignored.
- Library and Ingestion migrations create only owned table prefixes.
- No files outside the task commits and acknowledged user changes remain modified.
