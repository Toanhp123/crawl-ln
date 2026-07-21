# Novel Tool V3 Subproject 2: Backend Capability Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all production backend capabilities into `api-next`, migrate schema-version-22 data, and reach HTTP/integration parity without cross-module SQL or internal imports.

**Architecture:** Library owns novels and chapters; Ingestion owns jobs and crawl execution; Source Reader is decomposed behind its existing public facade; Scheduler, Search, Export, and Backup communicate through public APIs and durable events. Every cross-module command is idempotent and every table is owned by exactly one module.

**Tech Stack:** Node.js 22.12+, TypeScript 5.5, Express 4, Zod 3, SQLite `DatabaseSync`, Axios, Cheerio, Playwright Core, SES, AJV, JSZip, npm workspaces, Node test runner.

## Global Constraints

- Complete Subproject 1 first; its interfaces and architecture checks are immutable inputs.
- Preserve all current `/api/*` routes, status codes, envelopes, error codes, pagination, binary headers, and SSE schemas.
- Preserve Source Plugin SDK capability contract version `1` and sandbox protocol version `1`.
- Preserve schema-version-22 IDs, timestamps, chapter content, job outcomes, plugin metadata, encrypted records, and settings during migration.
- No backend module SQL may reference another module's table prefix.
- No backend module imports another module outside `public/`.
- No backend infrastructure model imports `@novel-tool/shared`; presentation owns transport mapping.
- Cross-module commands use stable `commandId` values and are idempotent.
- Every production change follows RED -> GREEN -> REFACTOR.

---

## Interfaces Consumed from Subproject 1

```ts
export interface LibraryApi {
  commands: LibraryCommands;
  queries: LibraryQueries;
}

export interface IngestionApi {
  commands: IngestionCommands;
  queries: IngestionQueries;
}

export interface SourceReaderApi {
  identify(request: IdentifyRequest): Promise<SourceReaderResult<SourceIdentity>>;
  readMetadata(request: ReadMetadataRequest): Promise<SourceReaderResult<NovelMetadata>>;
  readChapterList(request: ReadChapterListRequest): Promise<SourceReaderResult<Page<ChapterSummary>>>;
  streamChapterList(request: StreamChapterListRequest): AsyncIterable<SourceReaderResult<ChapterSummary[]>>;
  readChapterContent(request: ReadChapterContentRequest): Promise<SourceReaderResult<ChapterContent>>;
  search(request: SearchSourceRequest): Promise<SourceReaderResult<Page<NovelSearchResult>>>;
  latestUpdates(request: LatestUpdatesRequest): Promise<SourceReaderResult<Page<LatestUpdate>>>;
}
```

### Task 1: Implement the Library Domain and Repository Ports

**Files:**
- Create: `apps/api-next/src/modules/library/domain/entities/library-novel.entity.ts`
- Create: `apps/api-next/src/modules/library/domain/entities/library-chapter.entity.ts`
- Create: `apps/api-next/src/modules/library/domain/repositories/library.repository.ts`
- Create: `apps/api-next/src/modules/library/domain/errors/library.error.ts`
- Create: `tests/regression/api-next-library-domain.test.ts`

**Interfaces:**
- Consumes: Library contract primitives from Subproject 1.
- Produces: validated `LibraryNovel`, `LibraryChapter`, and domain transition methods used by all Library commands.

- [ ] **Step 1: Write failing entity tests**

```ts
test('library novel preserves identity while reconciling source metadata', () => {
  const current = LibraryNovelEntity.create(fixtureNovel());
  const next = current.reconcile({
    title: 'Updated', sourceName: 'NovelCool', author: 'Author', coverUrl: undefined,
    analyzedAt: '2026-07-21T01:00:00.000Z'
  });
  assert.equal(next.toPrimitives().id, current.toPrimitives().id);
  assert.equal(next.toPrimitives().title, 'Updated');
});

test('chapter content save increments content version only when content changes', () => {
  const chapter = LibraryChapterEntity.create(fixtureChapter({ contentVersion: 2 }));
  assert.equal(chapter.saveContent('raw', 'clean', now).toPrimitives().contentVersion, 3);
  assert.equal(chapter.saveContent(undefined, undefined, now).toPrimitives().contentVersion, 2);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --import tsx --test tests/regression/api-next-library-domain.test.ts
```

Expected: missing entity modules.

- [ ] **Step 3: Implement entities and repository ports**

Implement immutable entities with `create`, transition methods, and `toPrimitives`. Reject blank titles, invalid URLs, negative chapter indexes, and invalid lifecycle transitions with module-owned errors.

Define repository ports:

```ts
export interface LibraryRepository {
  findNovelById(id: string): Promise<LibraryNovelDetail | null>;
  findNovelBySourceUrl(sourceUrl: string): Promise<LibraryNovelDetail | null>;
  listNovels(query: ListLibraryNovelsQuery): Promise<PaginatedLibraryNovels>;
  getStats(): Promise<LibraryStats>;
  getChapter(novelId: string, chapterIndex: number): Promise<LibraryChapter | null>;
}

export interface LibraryUnitOfWork {
  reconcileAnalysis(command: ReconcileAnalysisCommand): LibraryNovelDetail;
  saveChapterContent(command: SaveChapterContentCommand): LibraryChapter;
  setIngestionState(command: SetLibraryIngestionStateCommand): void;
  deleteNovel(command: DeleteLibraryNovelCommand): void;
}
```

- [ ] **Step 4: Run focused tests and architecture check**

```powershell
node --import tsx --test tests/regression/api-next-library-domain.test.ts
npm run check:api-next-arch
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/library/domain tests/regression/api-next-library-domain.test.ts
git commit -m "feat: add v3 library domain"
```

### Task 2: Implement Library SQLite Mapping and Analysis Reconciliation

**Files:**
- Create: `apps/api-next/src/modules/library/infrastructure/sqlite/library-row.schemas.ts`
- Create: `apps/api-next/src/modules/library/infrastructure/sqlite/library-sqlite.repository.ts`
- Create: `apps/api-next/src/modules/library/infrastructure/sqlite/library-sqlite.unit-of-work.ts`
- Create: `apps/api-next/src/modules/library/application/commands/reconcile-analysis.command.ts`
- Create: `tests/integration/api-next-library-reconciliation.test.ts`

**Interfaces:**
- Consumes: `LibraryRepository`, `LibraryUnitOfWork`, `ReconcileAnalysisCommand`.
- Produces: atomic Library-only analysis reconciliation with stable chapter IDs and command receipts.

- [ ] **Step 1: Write failing reconciliation tests**

Cover initial insert, repeated `commandId`, metadata update, source URL chapter identity, missing-source chapters, and content preservation:

```ts
test('reconcile analysis preserves fetched content and stable IDs', async () => {
  const api = createLibraryTestApi();
  const first = await api.commands.reconcileAnalysis(firstAnalysis);
  await api.commands.saveChapterContent(contentCommand(first.chapters[0]!.id));
  const second = await api.commands.reconcileAnalysis(updatedAnalysisWithSameUrls);
  assert.equal(second.chapters[0]!.id, first.chapters[0]!.id);
  assert.equal(second.chapters[0]!.cleanText, 'saved content');
});

test('repeated analysis command returns the recorded result without duplicate writes', async () => {
  const api = createLibraryTestApi();
  const first = await api.commands.reconcileAnalysis(firstAnalysis);
  const repeated = await api.commands.reconcileAnalysis(firstAnalysis);
  assert.deepEqual(repeated, first);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-library-reconciliation.test.ts
```

Expected: missing SQLite adapter and command handler.

- [ ] **Step 3: Implement Library-only transaction logic**

Map rows through strict Zod schemas into Library domain models. In one `transactionSync`:

- Return recorded output when `library_command_receipts.command_id` exists.
- Upsert `library_novels` by source URL while preserving the persisted ID.
- Reconcile chapters by normalized source URL.
- Preserve content and content version for existing chapters.
- Mark absent chapters `source_available=0` and move them after active chapters.
- Insert a `library.analysis-reconciled` outbox event.
- Store the serialized public result in the command receipt.

Do not import Chapter or Novel types from `@novel-tool/shared`.

- [ ] **Step 4: Run Library integration and current identity tests**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-library-reconciliation.test.ts
node --experimental-sqlite --import tsx --test tests/integration/incremental-chapter-identity.test.ts
```

Expected: new tests pass; current behavior remains green.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/library/application apps/api-next/src/modules/library/infrastructure tests/integration/api-next-library-reconciliation.test.ts
git commit -m "feat: reconcile v3 library analysis"
```

### Task 3: Complete Library Commands and Queries

**Files:**
- Create: `apps/api-next/src/modules/library/application/commands/save-chapter-content.command.ts`
- Create: `apps/api-next/src/modules/library/application/commands/set-ingestion-state.command.ts`
- Create: `apps/api-next/src/modules/library/application/commands/delete-library-novel.command.ts`
- Create: `apps/api-next/src/modules/library/application/queries/library-queries.service.ts`
- Modify: `apps/api-next/src/modules/library/library.module.ts`
- Create: `tests/integration/api-next-library-api.test.ts`

**Interfaces:**
- Consumes: Library unit of work and repository.
- Produces: complete `LibraryApi` used by Ingestion, Scheduler, Search, Export, and HTTP presentation.

- [ ] **Step 1: Write failing API tests**

```ts
test('save content is idempotent and emits one content event', async () => {
  const api = seededLibraryApi();
  const first = await api.commands.saveChapterContent(saveCommand);
  const second = await api.commands.saveChapterContent(saveCommand);
  assert.deepEqual(second, first);
  assert.equal(countOutbox('library.chapter-content-saved'), 1);
});

test('delete novel removes only library-owned records', async () => {
  const api = seededLibraryApi();
  await api.commands.deleteNovel({ commandId: 'delete-1', novelId, deletedAt: now });
  assert.equal(await api.queries.getNovel(novelId), null);
  assert.equal(tableExists(database, 'ingestion_jobs'), false);
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --experimental-sqlite --import tsx --test tests/integration/api-next-library-api.test.ts`.

Expected: missing handlers.

- [ ] **Step 3: Implement the complete Library facade**

Each command validates the domain transition, performs one Library transaction, records `commandId`, and emits a Library outbox event. `LibraryQueriesService` implements pagination, filtering, stats, novel detail, chapter content, and export-source reads without transport types.

Construct:

```ts
const api: LibraryApi = {
  commands: { reconcileAnalysis, saveChapterContent, setIngestionState, deleteNovel },
  queries
};
```

- [ ] **Step 4: Run Library tests and API-next checks**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-library-*.test.ts
npm run check:api-next
npm run check:api-next-arch
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/library tests/integration/api-next-library-api.test.ts
git commit -m "feat: complete v3 library api"
```

### Task 4: Implement the Ingestion Job State Machine and Persistence

**Files:**
- Create: `apps/api-next/src/modules/ingestion/domain/entities/ingestion-job.entity.ts`
- Create: `apps/api-next/src/modules/ingestion/domain/repositories/ingestion.repository.ts`
- Create: `apps/api-next/src/modules/ingestion/infrastructure/sqlite/ingestion-row.schemas.ts`
- Create: `apps/api-next/src/modules/ingestion/infrastructure/sqlite/ingestion-sqlite.repository.ts`
- Create: `tests/regression/api-next-ingestion-domain.test.ts`
- Create: `tests/integration/api-next-ingestion-repository.test.ts`

**Interfaces:**
- Consumes: `IngestionJobStatus`, command contracts, module schema.
- Produces: legal state transitions and persistence confined to `ingestion_*` tables.

- [ ] **Step 1: Write failing domain and repository tests**

```ts
test('job rejects reopening a terminal state', () => {
  const completed = IngestionJobEntity.fromPrimitives(job({ status: 'completed' }));
  assert.throws(() => completed.resume(now), /Cannot resume/);
});

test('repository enforces one active job per novel', async () => {
  const repository = createRepository();
  await repository.create(job({ id: 'one', novelId: 'novel-1', status: 'queued' }), []);
  await assert.rejects(
    () => repository.create(job({ id: 'two', novelId: 'novel-1', status: 'queued' }), []),
    /active ingestion job/
  );
});
```

- [ ] **Step 2: Run and verify RED**

Run both new test files. Expected: missing job entity/repository.

- [ ] **Step 3: Implement state machine and repository**

Port current legal transition semantics, task outcomes, pause accounting, speed metrics, ETA, and counter invariants into `IngestionJobEntity`. Repository operations map through strict Zod row schemas and never return raw rows.

Create the partial unique index:

```sql
CREATE UNIQUE INDEX ingestion_one_active_job_per_novel
ON ingestion_jobs(novel_id)
WHERE status IN ('queued','running','pausing','paused','resuming');
```

- [ ] **Step 4: Run focused and current state-machine tests**

```powershell
node --import tsx --test tests/regression/api-next-ingestion-domain.test.ts
node --experimental-sqlite --import tsx --test tests/integration/api-next-ingestion-repository.test.ts
node --import tsx --test tests/regression/backend-logic-safety.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/ingestion/domain apps/api-next/src/modules/ingestion/infrastructure tests/regression/api-next-ingestion-domain.test.ts tests/integration/api-next-ingestion-repository.test.ts
git commit -m "feat: add v3 ingestion state and persistence"
```

### Task 5: Implement Analyze and Create-Job Workflows

**Files:**
- Create: `apps/api-next/src/modules/ingestion/application/ports/source-reader.port.ts`
- Create: `apps/api-next/src/modules/ingestion/application/services/analyze-novel.workflow.ts`
- Create: `apps/api-next/src/modules/ingestion/application/commands/create-ingestion-job.command.ts`
- Create: `apps/api-next/src/modules/ingestion/application/services/source-policy.service.ts`
- Create: `tests/regression/api-next-ingestion-analysis.test.ts`

**Interfaces:**
- Consumes: `SourceReaderApi` through a local `IngestionSourceReaderPort`, `LibraryCommands`, `LibraryQueries`.
- Produces: `IngestionCommands.analyzeNovel` and `createJob`.

- [ ] **Step 1: Write failing workflow tests**

```ts
test('analysis reads source data then reconciles it through Library public commands', async () => {
  const calls: string[] = [];
  const workflow = createWorkflow({ calls });
  const result = await workflow.execute({ commandId: 'analysis-1', url: sourceUrl, requestedAt: now });
  assert.deepEqual(calls, ['robots.check', 'source.metadata', 'source.chapters', 'library.reconcile']);
  assert.equal(result.novel.sourceUrl, normalizedUrl);
});

test('analysis rejects chapter URLs outside the metadata source host', async () => {
  await assert.rejects(() => createWorkflow({ offHostChapter: true }).execute(command), /outside/);
});
```

- [ ] **Step 2: Run and verify RED**

Run the new regression test. Expected: missing workflow.

- [ ] **Step 3: Implement workflows through ports only**

The local source-reader port exposes exactly metadata, streamed chapter list, and chapter content. Analysis enforces robots policy, same-host chapter URLs, non-empty lists, stable ID generation, and passes one `ReconcileAnalysisCommand` to Library.

Create-job loads the Library novel detail, selects non-fetched source-available chapters, creates an Ingestion job transaction, records a command receipt, and enqueues the job after commit.

- [ ] **Step 4: Run current and next analysis tests**

```powershell
node --import tsx --test tests/regression/api-next-ingestion-analysis.test.ts
node --import tsx --test tests/regression/crawler-source-reader-analyze.test.ts
node --import tsx --test tests/regression/crawler-source-reader-fetch.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/ingestion/application tests/regression/api-next-ingestion-analysis.test.ts
git commit -m "feat: add v3 ingestion analysis workflows"
```

### Task 6: Implement Queue Execution, Idempotent Chapter Delivery, and Recovery

**Files:**
- Create: `apps/api-next/src/modules/ingestion/application/services/ingestion-queue.service.ts`
- Create: `apps/api-next/src/modules/ingestion/application/services/ingestion-job-runner.service.ts`
- Create: `apps/api-next/src/modules/ingestion/application/services/chapter-fetch.service.ts`
- Create: `apps/api-next/src/modules/ingestion/application/commands/job-control.commands.ts`
- Create: `apps/api-next/src/modules/ingestion/application/queries/ingestion-queries.service.ts`
- Modify: `apps/api-next/src/modules/ingestion/ingestion.module.ts`
- Create: `tests/regression/api-next-ingestion-queue.test.ts`
- Create: `tests/integration/api-next-ingestion-recovery.test.ts`

**Interfaces:**
- Consumes: Library public commands/queries, source-reader port, Ingestion repository, clock, IDs, logger.
- Produces: complete `IngestionApi`, queue lifecycle, pause/resume/cancel, and crash recovery.

- [ ] **Step 1: Write failing idempotency and recovery tests**

```ts
test('runner retries Library delivery with the same command ID after an interrupted progress write', async () => {
  const scenario = createInterruptedRunnerScenario();
  await assert.rejects(() => scenario.runOnce(), /simulated process stop/);
  await scenario.recover();
  assert.deepEqual(scenario.libraryCommandIds, ['chapter:job-1:chapter-1', 'chapter:job-1:chapter-1']);
  assert.equal(scenario.libraryWriteCount, 1);
  assert.equal((await scenario.job()).fetchedChapters, 1);
});

test('queue stop aborts source requests and persists a recoverable paused job', async () => {
  const scenario = createRunningQueueScenario();
  await scenario.queue.stop();
  assert.equal(scenario.signal.aborted, true);
  assert.equal((await scenario.job()).status, 'paused');
});
```

- [ ] **Step 2: Run and verify RED**

Run both new test files. Expected: missing runner/queue.

- [ ] **Step 3: Implement the recoverable pipeline**

For each chapter:

1. Fetch and sanitize through Source Reader.
2. Derive `commandId = chapter:<jobId>:<chapterId>`.
3. Call `LibraryCommands.saveChapterContent` with that ID.
4. Persist the Ingestion chapter outcome and job progress in one Ingestion transaction.
5. Emit an Ingestion audit outbox event.

Queue shutdown rejects new jobs, aborts active signals, waits for runners, and leaves jobs recoverable. Recovery moves interrupted states to paused and records an audit event before accepting resume.

- [ ] **Step 4: Run next and current queue suites**

```powershell
node --import tsx --test tests/regression/api-next-ingestion-queue.test.ts
node --experimental-sqlite --import tsx --test tests/integration/api-next-ingestion-recovery.test.ts
npm run test:regression:prepared -- backend-concurrency-safety
```

If the test runner does not support a file filter, run the exact current files with `node --import tsx --test`.

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/ingestion tests/regression/api-next-ingestion-queue.test.ts tests/integration/api-next-ingestion-recovery.test.ts
git commit -m "feat: add recoverable v3 ingestion queue"
```

### Task 7: Build the Decomposed Source Reader Data Pipeline

**Files:**
- Create: `apps/api-next/src/modules/source-reader/public/source-reader.api.ts`
- Create: `apps/api-next/src/modules/source-reader/public/source-reader.models.ts`
- Create: `apps/api-next/src/modules/source-reader/application/services/candidate-resolver.ts`
- Create: `apps/api-next/src/modules/source-reader/application/services/reader-cache-policy.ts`
- Create: `apps/api-next/src/modules/source-reader/application/services/invocation-coordinator.ts`
- Create: `apps/api-next/src/modules/source-reader/application/services/pagination-coordinator.ts`
- Create: `apps/api-next/src/modules/source-reader/application/services/health-fallback.policy.ts`
- Create: `apps/api-next/src/modules/source-reader/application/source-reader.facade.ts`
- Create: `tests/regression/api-next-source-reader-pipeline.test.ts`

**Interfaces:**
- Consumes: canonical `@novel-tool/source-plugin-sdk` contracts and focused runtime/cache/health ports.
- Produces: existing `SourceReaderApi` behavior without a monolithic service.

- [ ] **Step 1: Write failing stage-isolation tests**

```ts
test('facade executes candidate, context, cache, invocation, validation and health stages in order', async () => {
  const trace: string[] = [];
  const facade = createPipeline({ trace });
  await facade.readMetadata({ url: sourceUrl });
  assert.deepEqual(trace, [
    'candidate.resolve', 'context.resolve', 'cache.lookup', 'invoke',
    'result.validate', 'health.success', 'cache.store'
  ]);
});

test('typed fallback advances only when policy allows it', async () => {
  const facade = createPipeline({ firstFailure: 'SOURCE_TEMPORARILY_UNAVAILABLE' });
  const result = await facade.readMetadata({ url: sourceUrl });
  assert.equal(result.source.pluginId, 'second-plugin');
});
```

- [ ] **Step 2: Run and verify RED**

Run the new test. Expected: missing facade/stages.

- [ ] **Step 3: Port behavior into focused services**

Keep the existing public request/result models. Move exact current policies into the named stages:

- Candidate ordering and matcher behavior.
- Signed cursor binding and pagination progress.
- Scoped cache keys, TTL, stale public refresh, and tags.
- Rate limit, circuit breaker, timeout, browser session, and runtime invocation.
- Contract/extension result validation.
- Health eligibility, recording, quarantine, and typed fallback.

`SourceReaderFacade` coordinates stages and contains no SQL, crypto, browser, or plugin-process implementation.

- [ ] **Step 4: Run pipeline parity tests**

```powershell
node --import tsx --test tests/regression/api-next-source-reader-pipeline.test.ts
node --import tsx --test tests/regression/source-reader*.test.ts
```

Use PowerShell to expand current Source Reader regression files when wildcard expansion is unavailable.

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/source-reader tests/regression/api-next-source-reader-pipeline.test.ts
git commit -m "feat: add decomposed source reader pipeline"
```

### Task 8: Port Source Reader Runtime, Security, and Persistence

**Files:**
- Create: `apps/api-next/src/modules/source-reader/infrastructure/migrations/001-source-reader-schema.ts`
- Create: `apps/api-next/src/modules/source-reader/infrastructure/plugins/`
- Create: `apps/api-next/src/modules/source-reader/infrastructure/runtime/`
- Create: `apps/api-next/src/modules/source-reader/infrastructure/secrets/`
- Create: `apps/api-next/src/modules/source-reader/infrastructure/network/`
- Create: `apps/api-next/src/modules/source-reader/infrastructure/browser/`
- Create: `apps/api-next/src/modules/source-reader/infrastructure/sqlite/`
- Create: `tests/integration/api-next-source-reader-runtime.test.ts`

**Interfaces:**
- Consumes: focused Source Reader ports from Task 7 and existing SDK/sandbox contracts.
- Produces: built-in NovelCool and isolated external plugin execution with current security guarantees.

- [ ] **Step 1: Write failing runtime parity tests**

Test package checksums/signatures, external process permissions, SDK error allowlist, RPC bounds, cancellation, browser identity, encrypted credentials, session binding, proxy routes, cache scopes, and NovelCool fixtures. Reuse current fixtures but instantiate API-next adapters.

Example:

```ts
test('external plugin cannot import node modules or escape its package root', async () => {
  const runtime = await createExternalRuntime(hostileFixture);
  await assert.rejects(() => runtime.invoke(metadataInvocation),
    (error: unknown) => error instanceof SourceReaderError &&
      error.code === 'PLUGIN_SANDBOX_POLICY_VIOLATION');
});
```

- [ ] **Step 2: Run and verify RED**

Run `node --experimental-sqlite --import tsx --test tests/integration/api-next-source-reader-runtime.test.ts`.

Expected: missing runtime adapters.

- [ ] **Step 3: Port adapters without porting the old god service**

Port verified current implementations into focused infrastructure directories. Keep package verification limits, Node permission flags, SES compartment restrictions, protocol schemas, vault AAD, network allowlists, browser worker isolation, and cache metadata unchanged. All SQLite access uses only `source_reader_*` tables and maps to Source Reader-owned models.

- [ ] **Step 4: Run API-next and current Source Reader integration suites**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-source-reader-runtime.test.ts
npm run test:integration
```

Expected: all existing and next Source Reader integration tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/source-reader/infrastructure tests/integration/api-next-source-reader-runtime.test.ts
git commit -m "feat: port secure source reader runtime"
```

### Task 9: Port Source Reader Administration and HTTP Presentation

**Files:**
- Create: `apps/api-next/src/modules/source-reader/application/admin/`
- Create: `apps/api-next/src/modules/source-reader/presentation/source-reader.controller.ts`
- Create: `apps/api-next/src/modules/source-reader/presentation/source-reader-admin.controller.ts`
- Create: `apps/api-next/src/modules/source-reader/presentation/source-reader.routes.ts`
- Create: `apps/api-next/src/modules/source-reader/source-reader.module.ts`
- Create: `tests/contract/source-reader-http-contract.test.ts`

**Interfaces:**
- Consumes: Source Reader facade, actor policy, plugin/credential/network/challenge administration services.
- Produces: complete existing `/api/source-reader/*` surface.

- [ ] **Step 1: Write dual-runtime HTTP contract tests**

Run the same contract cases against current and next runtimes for identify, metadata, chapter list/content, plugin list/diagnostics, permission approval, credentials, network profiles, challenges, multipart install limits, redaction, request IDs, and 204 commands.

- [ ] **Step 2: Run and verify RED**

Run `npm run test:contract`. Expected: next runtime returns 404 for Source Reader routes.

- [ ] **Step 3: Implement admin services and presentation mapping**

Move health administration out of composition. Define `PluginDiagnosticsService` and `PluginHealthCheckService` under application/admin. Controllers parse Zod DTOs, call public services, map transport results, and never query repositories.

Wire routes under the existing prefix and retain actor/request-ID middleware semantics.

- [ ] **Step 4: Run contract and Source Reader suites**

```powershell
npm run test:contract
npm run test:integration
npm run check:api-next-arch
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/source-reader tests/contract/source-reader-http-contract.test.ts
git commit -m "feat: complete v3 source reader api"
```

### Task 10: Implement Scheduler-Owned Policies

**Files:**
- Create: `apps/api-next/src/modules/scheduler/`
- Create: `tests/integration/api-next-scheduler.test.ts`
- Create: `tests/contract/scheduler-http-contract.test.ts`

**Interfaces:**
- Consumes: `LibraryQueries`, `IngestionCommands.refreshNovel`, clock, IDs, event bus.
- Produces: scheduler public API, `scheduler_policies`, diagnostics, and existing scheduler HTTP routes.

- [ ] **Step 1: Write failing ownership and behavior tests**

```ts
test('scheduler changes policy without updating library tables', async () => {
  const scheduler = createSchedulerTestApi();
  await scheduler.commands.updatePolicy({ novelId, enabled: true, intervalMinutes: 360 });
  assert.equal(readSchedulerPolicy(novelId)?.intervalMinutes, 360);
  assert.equal(libraryUpdateCount(), 0);
});

test('due tick calls Ingestion refresh and records diagnostics', async () => {
  await scheduler.lifecycle.tick();
  assert.deepEqual(refreshCalls, [novelId]);
  assert.equal((await scheduler.queries.listDiagnostics(novelId)).length, 1);
});
```

- [ ] **Step 2: Run and verify RED**

Run scheduler next tests. Expected: missing module.

- [ ] **Step 3: Implement Scheduler module**

Create module-owned policies/diagnostics migrations, domain policy calculation, tick service, lifecycle, public API, controllers, and routes. Scheduler stores only opaque `novelId`; it checks existence through `LibraryQueries.getNovel` and initiates work through `IngestionCommands.refreshNovel`.

- [ ] **Step 4: Run next/current scheduler and architecture tests**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-scheduler.test.ts
npm run test:contract
npm run check:api-next-arch
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/scheduler tests/integration/api-next-scheduler.test.ts tests/contract/scheduler-http-contract.test.ts
git commit -m "feat: add scheduler-owned update policies"
```

### Task 11: Implement Event-Driven Search Projection

**Files:**
- Create: `apps/api-next/src/modules/search/`
- Create: `tests/integration/api-next-search-projection.test.ts`
- Create: `tests/contract/search-http-contract.test.ts`

**Interfaces:**
- Consumes: `library.analysis-reconciled`, `library.chapter-content-saved`, and `library.novel-deleted` events.
- Produces: Search query/rebuild API and existing `/api/search` contract.

- [ ] **Step 1: Write failing projection tests**

```ts
test('library events build and update search documents idempotently', async () => {
  await handler.handle(analysisEvent);
  await handler.handle(analysisEvent);
  await handler.handle(contentEvent);
  assert.equal(countDocuments(), 2);
  assert.match((await search.query({ q: 'dragon', type: 'all', limit: 20, offset: 0 })).items[0]!.snippet, /dragon/i);
});
```

- [ ] **Step 2: Run and verify RED**

Run next search test. Expected: missing module.

- [ ] **Step 3: Implement projection ownership**

Create `search_documents` FTS table plus `search_projection_checkpoints`. Remove direct triggers against Library tables in V3. Handlers upsert/delete projection records and store event IDs to prevent duplicate effects. Rebuild reads through a paginated Library export/query port, not raw tables.

- [ ] **Step 4: Run search parity and contract tests**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-search-projection.test.ts
npm run test:contract
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/search tests/integration/api-next-search-projection.test.ts tests/contract/search-http-contract.test.ts
git commit -m "feat: add v3 search projection"
```

### Task 12: Port Export Through Library Queries

**Files:**
- Create: `apps/api-next/src/modules/export/`
- Create: `tests/integration/api-next-export.test.ts`
- Create: `tests/contract/export-http-contract.test.ts`

**Interfaces:**
- Consumes: `LibraryQueries` export-source operation.
- Produces: current EPUB/TXT binary behavior without direct Library SQL.

- [ ] **Step 1: Write failing binary parity tests**

Assert filename, MIME type, content disposition, chapter filtering/ranges, UTF-8 BOM text output, EPUB package entries, and current error envelope.

- [ ] **Step 2: Run and verify RED**

Run the next export test. Expected: next route 404.

- [ ] **Step 3: Port export pipeline and writers**

Define an Export-owned `NovelExportSourcePort` implemented by an adapter over `LibraryQueries`. Port the current writers without database imports. Presentation maps `@novel-tool/shared` request DTOs and streams the produced buffer.

- [ ] **Step 4: Run export integration and HTTP contracts**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-export.test.ts
npm run test:contract
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/export tests/integration/api-next-export.test.ts tests/contract/export-http-contract.test.ts
git commit -m "feat: port v3 export module"
```

### Task 13: Implement Backup Contributors and the V22-to-V3 Importer

**Files:**
- Create: `apps/api-next/src/modules/backup/`
- Create: `apps/api-next/src/platform/migration/v22-importer.ts`
- Create: `apps/api-next/src/platform/migration/v22-validation.ts`
- Create: `tests/integration/api-next-v22-import.test.ts`
- Create: `tests/integration/api-next-backup.test.ts`

**Interfaces:**
- Consumes: module `BackupContributor` interfaces, V22 fixture, maintenance lifecycle.
- Produces: full replace backup/restore, merge contributor orchestration, and validated V22 import.

- [ ] **Step 1: Write failing migration and rollback tests**

```ts
test('v22 importer preserves IDs, content hashes, outcomes and source reader metadata', async () => {
  const fixture = await createV22Fixture(root);
  const report = await importV22Database({ source: fixture.databasePath, target: targetPath });
  assert.equal(report.valid, true);
  assert.deepEqual(report.ids, fixture.ids);
  assert.deepEqual(report.counts, fixture.counts);
});

test('failed validation leaves target replacement unapplied', async () => {
  await assert.rejects(() => importCorruptedFixture(), /validation failed/);
  assert.equal(await readMarker(productionPath), 'original');
});
```

- [ ] **Step 2: Run and verify RED**

Run both new integration files. Expected: missing Backup/importer modules.

- [ ] **Step 3: Implement contributors and importer**

Define:

```ts
export interface BackupContributor {
  module: string;
  exportMergeData(): Promise<unknown>;
  importMergeData(data: unknown, context: { importId: string }): Promise<void>;
}
```

Replace restore operates on an offline database snapshot. Merge restore parses the archive and invokes each contributor. The V22 importer reads legacy tables, maps into module-owned commands/repositories, preserves IDs/timestamps, rebuilds Search, and returns a validation report containing counts and SHA-256 chapter hashes. It writes only to a staging target and never replaces the source path.

- [ ] **Step 4: Run migration, backup, and current backup suites**

```powershell
node --experimental-sqlite --import tsx --test tests/integration/api-next-v22-import.test.ts
node --experimental-sqlite --import tsx --test tests/integration/api-next-backup.test.ts
npm run test:integration
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next/src/modules/backup apps/api-next/src/platform/migration tests/integration/api-next-v22-import.test.ts tests/integration/api-next-backup.test.ts
git commit -m "feat: add v22 migration and v3 backup"
```

### Task 14: Complete HTTP Presentation, Realtime, and Backend Parity

**Files:**
- Create: `apps/api-next/src/modules/library/presentation/`
- Create: `apps/api-next/src/modules/ingestion/presentation/`
- Create: `apps/api-next/src/platform/realtime/`
- Modify: `apps/api-next/src/app.ts`
- Modify: `apps/api-next/src/bootstrap/app-container.ts`
- Create: `tests/contract/library-ingestion-http-contract.test.ts`
- Create: `tests/contract/realtime-http-contract.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all completed V3 module public APIs and application events.
- Produces: full current API route surface and `verify:v3:backend`.

- [ ] **Step 1: Add remaining dual-runtime contract cases**

Cover novels analyze/list/stats/detail/update/delete, chapters, crawl jobs/control/events, task list/detail/summary, scheduler, search, export, backup, Source Reader, 404, errors, SSE resources, request IDs, remote access, and CORS.

- [ ] **Step 2: Run and verify RED**

Run `npm run test:contract`. Expected: next runtime failures for unwired routes.

- [ ] **Step 3: Implement thin presentation and event adapters**

Controllers parse shared Zod DTOs, call module APIs, and map application models through presentation mappers. Realtime resource mapping lives in `platform/realtime/application-event-to-realtime.adapter.ts`, not composition root. Route factories accept controllers only.

Add:

```json
"verify:v3:backend": "npm run check:api-next-arch && npm run check:api-next && npm run build:api-next && npm run test:contract && npm run test:regression && npm run test:integration"
```

- [ ] **Step 4: Run complete backend verification**

```powershell
npm run verify:v3:backend
```

Expected: exit 0 with current and next contract parity.

- [ ] **Step 5: Commit**

```powershell
git add apps/api-next tests/contract package.json package-lock.json
git commit -m "feat: complete v3 backend parity"
```

## Subproject 2 Completion Gate

Run fresh:

```powershell
npm run verify:v3:backend
node scripts/check-docs.mjs
git status --short
```

Required result:

- All current regression/integration tests pass.
- All dual-runtime HTTP contract tests pass.
- V22 fixture import validates IDs, counts, content hashes, outcomes, and Source Reader metadata.
- Architecture checker reports no cross-module internal import, foreign table prefix, transport-model leak, or composition behavior.
- `apps/api` remains runnable as the reference implementation.
