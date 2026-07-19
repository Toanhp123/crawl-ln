# Source Reader Crawler Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Source Reader the only backend path used to analyze novels and fetch chapters, then remove SourceProfile, selector adapter, and the old plugin module without a compatibility layer.

**Architecture:** Compose the core service as its own backend module, adapt crawler use cases to the public `SourceReaderApi`, expose minimal reader preview endpoints, then delete all old source detection and plugin execution code. Crawler retains robots policy, domain pacing, queueing, persistence, progress, and business retry.

**Tech Stack:** TypeScript 5.5, Express 4, Node test runner, existing dependency-injection composition functions, existing crawler and novel application ports.

## Global Constraints

- Final backend has one source-reading path through `SourceReaderApi`.
- `crawler`, `novels`, and `search` may import only `modules/source-reader/public/*`.
- Source Reader never writes novel, chapter, or crawl-task tables.
- Crawler keeps robots policy, rate limiting, queueing, progress, and persistence.
- Delete the old `modules/plugin` directory, `source-profiles.json`, `SourceDetectorService`, `CrawlerEngineService`, `SelectorHtmlAdapter`, and `PluginSourceAdapter`.
- Do not add a legacy adapter, feature flag, or fallback to old parsing.

---

### Task 1: Compose Source Reader as a standalone module

**Files:**
- Create: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Modify: `apps/api/src/shared/config/env.ts`
- Modify: `apps/api/src/shared/container/app-container.ts`
- Test: `tests/regression/source-reader-module-boundary.test.ts`

**Interfaces:**
- Consumes: core components created by the previous plan and shared HTTP/HTML/clock/logger infrastructure.
- Produces: `SourceReaderModule` with `api`, `presentation` placeholder, and lifecycle surface for later plans.

- [ ] **Step 1: Write the failing module-boundary test**

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('app container composes a standalone source reader before crawler', async () => {
  const container = await readFile('apps/api/src/shared/container/app-container.ts', 'utf8');
  const moduleSource = await readFile(
    'apps/api/src/shared/container/modules/source-reader.module.ts',
    'utf8'
  );
  assert.match(container, /createSourceReaderModule/);
  assert.match(container, /const sourceReader = createSourceReaderModule\(infrastructure\)/);
  assert.match(container, /createCrawlerModule\([^)]*sourceReader/s);
  assert.match(moduleSource, /satisfies SourceReaderApi/);
  assert.doesNotMatch(moduleSource, /modules\/crawler\/infrastructure/);
});
```

- [ ] **Step 2: Run the test and verify the missing composition module**

Run:

```bash
node --import tsx --test tests/regression/source-reader-module-boundary.test.ts
```

Expected: FAIL because `source-reader.module.ts` does not exist.

- [ ] **Step 3: Add Source Reader runtime configuration**

```ts
// Add to apps/api/src/shared/config/env.ts inside env
sourceReaderCursorKey:
  process.env.SOURCE_READER_CURSOR_KEY ??
  'development-only-source-reader-cursor-key-32-bytes',
sourceReaderMemoryCacheEntries: numberEnv('SOURCE_READER_MEMORY_CACHE_ENTRIES', 500)
```

- [ ] **Step 4: Implement the module composition**

```ts
// apps/api/src/shared/container/modules/source-reader.module.ts
import { SourceReaderService } from '../../../modules/source-reader/application/services/source-reader.service.js';
import { MemoryReaderCache } from '../../../modules/source-reader/infrastructure/cache/memory-reader.cache.js';
import { HmacCursorCodec } from '../../../modules/source-reader/infrastructure/cursor/hmac-cursor.codec.js';
import { novelCoolPlugin } from '../../../modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.js';
import { InMemoryPluginRegistry } from '../../../modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.js';
import { InProcessPluginRuntime } from '../../../modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.js';
import { PluginContextFactory } from '../../../modules/source-reader/infrastructure/runtime/plugin-context.factory.js';
import type { SourceReaderApi } from '../../../modules/source-reader/public/source-reader.api.js';
import { AxiosHttpClientAdapter } from '../../infrastructure/http/axios-http-client.adapter.js';
import { CheerioHtmlParserAdapter } from '../../infrastructure/html/cheerio-html-parser.adapter.js';
import { env } from '../../config/env.js';
import type { InfrastructureModule } from './infrastructure.module.js';

export function createSourceReaderModule(infrastructure: InfrastructureModule) {
  const registry = new InMemoryPluginRegistry();
  registry.register(novelCoolPlugin, {
    trustLevel: 'built-in',
    executionMode: 'in-process',
    enabled: true
  });

  const api = new SourceReaderService(
    registry,
    new InProcessPluginRuntime(),
    new PluginContextFactory(
      new AxiosHttpClientAdapter(),
      new CheerioHtmlParserAdapter(),
      infrastructure.clock,
      infrastructure.logger
    ),
    new MemoryReaderCache(env.sourceReaderMemoryCacheEntries),
    new HmacCursorCodec(Buffer.from(env.sourceReaderCursorKey.padEnd(32, '0').slice(0, 32)))
  ) satisfies SourceReaderApi;

  return {
    api,
    presentation: {},
    lifecycle: {
      async start() {},
      async stop() {}
    }
  };
}

export type SourceReaderModule = ReturnType<typeof createSourceReaderModule>;
```

- [ ] **Step 5: Wire Source Reader into the app container before crawler**

```ts
// Relevant changes in apps/api/src/shared/container/app-container.ts
import { createSourceReaderModule } from './modules/source-reader.module.js';

const sourceReader = createSourceReaderModule(infrastructure);
const crawler = createCrawlerModule(
  infrastructure,
  novelsPersistence,
  tasks,
  chapters,
  sourceReader
);
```

```ts
// Lifecycle order
await sourceReader.lifecycle.start();
await crawler.api.recoverCrawlJobs.execute();

await crawler.lifecycle.queue.stop();
await sourceReader.lifecycle.stop();
```

- [ ] **Step 6: Run module test, architecture check, and API typecheck**

Run:

```bash
node --import tsx --test tests/regression/source-reader-module-boundary.test.ts
npm run check:arch
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit composition**

```bash
git add apps/api/src/shared/config/env.ts apps/api/src/shared/container/app-container.ts apps/api/src/shared/container/modules/source-reader.module.ts tests/regression/source-reader-module-boundary.test.ts
git commit -m "feat(source-reader): compose standalone module"
```

---

### Task 2: Replace crawler analyze with Source Reader metadata and streamed chapters

**Files:**
- Modify: `apps/api/src/modules/crawler/application/use-cases/analyze-source.usecase.ts`
- Create: `apps/api/src/modules/crawler/application/ports/source-reader.port.ts`
- Modify: `apps/api/src/shared/container/modules/crawler.module.ts`
- Test: `tests/regression/crawler-source-reader-analyze.test.ts`

**Interfaces:**
- Consumes: `SourceReaderApi.readMetadata()` and `SourceReaderApi.streamChapterList()`.
- Produces: the existing `AnalyzeNovelResult` expected by novels and crawl preview, preserving crawler public API while changing its implementation.

- [ ] **Step 1: Write the failing analyze use-case test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { AnalyzeSourceUseCase } from '../../apps/api/src/modules/crawler/application/use-cases/analyze-source.usecase.ts';

const robots = { check: async () => ({ allowed: true, crawlDelayMs: 0 }) };
const reader = {
  readMetadata: async ({ url }: { url: string }) => ({
    data: {
      title: 'Reader Novel',
      sourceUrl: url,
      sourceName: 'Reader Plugin',
      author: 'Author'
    },
    source: {
      pluginId: 'reader-plugin',
      pluginVersion: '1.0.0',
      domain: 'example.test',
      capability: 'metadata' as const
    }
  }),
  async *streamChapterList({ url }: { url: string }) {
    yield {
      data: [
        { index: 1, title: 'Chapter 1', url: `${url}/chapter/1` },
        { index: 2, title: 'Chapter 2', url: `${url}/chapter/2` }
      ],
      source: {
        pluginId: 'reader-plugin',
        pluginVersion: '1.0.0',
        domain: 'example.test',
        capability: 'chapter-list' as const
      }
    };
  }
};

test('crawler analyze composes metadata and chapter stream from Source Reader', async () => {
  const result = await new AnalyzeSourceUseCase(reader as never, robots).execute(
    'https://example.test/book'
  );
  assert.equal(result.title, 'Reader Novel');
  assert.equal(result.sourceName, 'Reader Plugin');
  assert.deepEqual(result.chapters.map((chapter) => chapter.index), [1, 2]);
  assert.equal(result.diagnostics?.chapterCount, 2);
});
```

- [ ] **Step 2: Run the test and verify constructor mismatch**

Run:

```bash
node --import tsx --test tests/regression/crawler-source-reader-analyze.test.ts
```

Expected: FAIL because `AnalyzeSourceUseCase` still expects `SourceAdapter[]`.

- [ ] **Step 3: Define a local crawler port to the Source Reader public contract**

```ts
// apps/api/src/modules/crawler/application/ports/source-reader.port.ts
import type {
  ChapterSummary,
  NovelMetadata,
  SourceReaderResult
} from '../../../source-reader/public/source-reader.models.js';

export interface CrawlerSourceReaderPort {
  readMetadata(request: {
    url: string;
    signal?: AbortSignal;
  }): Promise<SourceReaderResult<NovelMetadata>>;
  streamChapterList(request: {
    url: string;
    batchSize?: number;
    signal?: AbortSignal;
  }): AsyncIterable<SourceReaderResult<ChapterSummary[]>>;
  readChapterContent(request: {
    url: string;
    signal?: AbortSignal;
  }): Promise<
    SourceReaderResult<{
      title: string;
      url: string;
      rawText: string;
      cleanText: string;
    }>
  >;
}
```

- [ ] **Step 4: Replace adapter selection with Source Reader calls**

```ts
// apps/api/src/modules/crawler/application/use-cases/analyze-source.usecase.ts
import type { AnalyzeNovelResult } from '../models/crawler-contracts.js';
import { CrawlerBadRequestError, CrawlerForbiddenError } from '../errors/crawler.error.js';
import type { RobotsPolicyPort } from '../ports/robots-policy.port.js';
import type { CrawlerSourceReaderPort } from '../ports/source-reader.port.js';

const PREVIEW_CHAPTERS = 3;
const CHAPTER_BATCH_SIZE = 200;

function comparableHostname(url: string) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

export class AnalyzeSourceUseCase {
  constructor(
    private readonly sourceReader: CrawlerSourceReaderPort,
    private readonly robotsPolicy: RobotsPolicyPort
  ) {}

  async execute(url: string, signal?: AbortSignal): Promise<AnalyzeNovelResult> {
    const policy = await this.robotsPolicy.check(url);
    if (!policy.allowed) throw new CrawlerForbiddenError(policy.reason ?? 'Crawl blocked by policy');

    const metadata = await this.sourceReader.readMetadata({ url, signal });
    const chapters: AnalyzeNovelResult['chapters'] = [];
    for await (const batch of this.sourceReader.streamChapterList({
      url,
      batchSize: CHAPTER_BATCH_SIZE,
      signal
    })) {
      chapters.push(...batch.data);
    }

    if (chapters.length === 0) {
      throw new CrawlerBadRequestError('Analyze failed: source returned 0 chapters');
    }
    const sourceHost = comparableHostname(metadata.data.sourceUrl);
    const offHost = chapters.find(
      (chapter) => comparableHostname(chapter.url) !== sourceHost
    );
    if (offHost) {
      throw new CrawlerBadRequestError('Analyze failed: chapter URL is outside the source host', {
        sourceUrl: metadata.data.sourceUrl,
        chapterUrl: offHost.url
      });
    }

    return {
      ...metadata.data,
      chapters,
      diagnostics: {
        chapterCount: chapters.length,
        firstChapterUrls: chapters.slice(0, PREVIEW_CHAPTERS).map((chapter) => chapter.url)
      }
    };
  }
}
```

- [ ] **Step 5: Update crawler composition**

```ts
// Signature and construction in apps/api/src/shared/container/modules/crawler.module.ts
import type { SourceReaderModule } from './source-reader.module.js';

export function createCrawlerModule(
  infrastructure: InfrastructureModule,
  novels: NovelsPersistence,
  tasks: TasksModule,
  chapters: ChaptersModule,
  sourceReader: SourceReaderModule
) {
  // keep crawler repositories, robots, rate limiter, queue, persistence
  const analyzeSource = new AnalyzeSourceUseCase(sourceReader.api, robotsPolicy);
}
```

- [ ] **Step 6: Run focused analyze tests and integration typecheck**

Run:

```bash
node --import tsx --test tests/regression/crawler-source-reader-analyze.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit analyze cutover**

```bash
git add apps/api/src/modules/crawler/application/ports/source-reader.port.ts apps/api/src/modules/crawler/application/use-cases/analyze-source.usecase.ts apps/api/src/shared/container/modules/crawler.module.ts tests/regression/crawler-source-reader-analyze.test.ts
git commit -m "refactor(crawler): analyze through source reader"
```

---

### Task 3: Replace chapter fetching with Source Reader while preserving crawler policy

**Files:**
- Modify: `apps/api/src/modules/crawler/application/use-cases/fetch-chapter.usecase.ts`
- Modify: `apps/api/src/shared/container/modules/crawler.module.ts`
- Test: `tests/regression/crawler-source-reader-fetch.test.ts`

**Interfaces:**
- Consumes: `CrawlerSourceReaderPort.readChapterContent()`.
- Produces: existing `ChapterContentResult` for the crawl job runner.

- [ ] **Step 1: Write the failing fetch test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { FetchChapterUseCase } from '../../apps/api/src/modules/crawler/application/use-cases/fetch-chapter.usecase.ts';

const calls: string[] = [];
const robots = { check: async () => ({ allowed: true, crawlDelayMs: 25 }) };
const limiter = { wait: async (host: string, delay: number) => calls.push(`${host}:${delay}`) };
const reader = {
  readChapterContent: async ({ url }: { url: string }) => ({
    data: { title: 'Chapter', url, rawText: 'raw', cleanText: 'clean' },
    source: {
      pluginId: 'demo',
      pluginVersion: '1.0.0',
      domain: 'example.test',
      capability: 'chapter-content' as const
    }
  })
};

test('crawler keeps robots and pacing around Source Reader chapter fetch', async () => {
  const result = await new FetchChapterUseCase(reader as never, robots, limiter).execute(
    'https://example.test/chapter/1'
  );
  assert.equal(result.cleanText, 'clean');
  assert.deepEqual(calls, ['example.test:25']);
});
```

- [ ] **Step 2: Run the test and verify constructor mismatch**

Run:

```bash
node --import tsx --test tests/regression/crawler-source-reader-fetch.test.ts
```

Expected: FAIL because `FetchChapterUseCase` still expects `SourceAdapter[]`.

- [ ] **Step 3: Replace adapter lookup with Source Reader invocation**

```ts
// apps/api/src/modules/crawler/application/use-cases/fetch-chapter.usecase.ts
import type { ChapterContentResult } from '../models/crawler-contracts.js';
import { CrawlerForbiddenError } from '../errors/crawler.error.js';
import type { RateLimiterPort } from '../ports/rate-limiter.port.js';
import type { RobotsPolicyPort } from '../ports/robots-policy.port.js';
import type { CrawlerSourceReaderPort } from '../ports/source-reader.port.js';

export class FetchChapterUseCase {
  constructor(
    private readonly sourceReader: CrawlerSourceReaderPort,
    private readonly robotsPolicy: RobotsPolicyPort,
    private readonly rateLimiter: RateLimiterPort
  ) {}

  async execute(url: string, signal?: AbortSignal): Promise<ChapterContentResult> {
    const policy = await this.robotsPolicy.check(url);
    if (!policy.allowed) throw new CrawlerForbiddenError(policy.reason ?? 'Crawl blocked by policy');
    await this.rateLimiter.wait(new URL(url).hostname.toLowerCase(), policy.crawlDelayMs);
    const result = await this.sourceReader.readChapterContent({ url, signal });
    return result.data;
  }
}
```

- [ ] **Step 4: Update composition to construct FetchChapterUseCase with `sourceReader.api`**

```ts
const fetchChapter = new FetchChapterUseCase(
  sourceReader.api,
  robotsPolicy,
  rateLimiter
);
```

- [ ] **Step 5: Run focused tests, crawl runner tests, and typecheck**

Run:

```bash
node --import tsx --test \
  tests/regression/crawler-source-reader-fetch.test.ts \
  tests/regression/crawler-functional-safety.test.ts \
  tests/regression/recovery-and-task-creation.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 6: Commit chapter-fetch cutover**

```bash
git add apps/api/src/modules/crawler/application/use-cases/fetch-chapter.usecase.ts apps/api/src/shared/container/modules/crawler.module.ts tests/regression/crawler-source-reader-fetch.test.ts
git commit -m "refactor(crawler): fetch chapters through source reader"
```

---

### Task 4: Add minimal reader preview HTTP endpoints

**Files:**
- Create: `apps/api/src/modules/source-reader/presentation/dto/source-reader.dto.ts`
- Create: `apps/api/src/modules/source-reader/presentation/controllers/source-reader.controller.ts`
- Create: `apps/api/src/modules/source-reader/presentation/routes/source-reader.routes.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Modify: `apps/api/src/shared/container/app-container.ts`
- Modify: `apps/api/src/app.ts`
- Test: `tests/integration/source-reader-http.test.ts`

**Interfaces:**
- Consumes: `SourceReaderApi`.
- Produces: `/api/source-reader/identify`, `/metadata`, `/chapter-list`, and `/chapter-content`; no admin endpoints yet.

- [ ] **Step 1: Write a failing HTTP integration test with a test plugin injection seam**

```ts
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const storageDir = await mkdtemp(join(tmpdir(), 'source-reader-http-'));
process.env.STORAGE_DIR = storageDir;
const { createAppRuntime } = await import('../../apps/api/src/app.ts');
const runtime = createAppRuntime({ startBackgroundServices: false });
const server = runtime.app.listen(0);
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;

test.after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  await runtime.lifecycle.stop();
  await rm(storageDir, { recursive: true, force: true });
});

test('source reader endpoint rejects unsupported domains with a typed code', async () => {
  const response = await fetch(`${baseUrl}/api/source-reader/metadata`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://unsupported.invalid/book' })
  });
  assert.equal(response.status, 422);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'SOURCE_NOT_SUPPORTED');
});
```

- [ ] **Step 2: Run the test and verify route-not-found**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-http.test.ts
```

Expected: FAIL because `/api/source-reader/metadata` returns 404.

- [ ] **Step 3: Implement DTO validation**

```ts
// apps/api/src/modules/source-reader/presentation/dto/source-reader.dto.ts
import { z } from 'zod';

export const sourceUrlRequestSchema = z.object({
  url: z.string().url(),
  credentialProfileId: z.string().min(1).optional(),
  networkProfileId: z.string().min(1).optional(),
  freshOnly: z.boolean().optional()
});

export const chapterListRequestSchema = sourceUrlRequestSchema.extend({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(500).optional()
});
```

- [ ] **Step 4: Implement controller methods**

```ts
// apps/api/src/modules/source-reader/presentation/controllers/source-reader.controller.ts
import type { Request, Response } from 'express';
import type { SourceReaderApi } from '../../public/source-reader.api.js';
import { ok } from '../../../../shared/http/api-response.js';
import { validate } from '../../../../shared/validation/validate.js';
import { chapterListRequestSchema, sourceUrlRequestSchema } from '../dto/source-reader.dto.js';

export class SourceReaderController {
  constructor(private readonly api: SourceReaderApi) {}

  identify = async (req: Request, res: Response) =>
    ok(res, await this.api.identify(validate(sourceUrlRequestSchema, req.body)));

  metadata = async (req: Request, res: Response) =>
    ok(res, await this.api.readMetadata(validate(sourceUrlRequestSchema, req.body)));

  chapterList = async (req: Request, res: Response) =>
    ok(res, await this.api.readChapterList(validate(chapterListRequestSchema, req.body)));

  chapterContent = async (req: Request, res: Response) =>
    ok(res, await this.api.readChapterContent(validate(sourceUrlRequestSchema, req.body)));
}
```

- [ ] **Step 5: Implement route factory and composition**

```ts
// apps/api/src/modules/source-reader/presentation/routes/source-reader.routes.ts
import { Router } from 'express';
import { asyncHandler } from '../../../../shared/http/async-handler.js';
import type { SourceReaderController } from '../controllers/source-reader.controller.js';

export function createSourceReaderRoutes(controller: SourceReaderController) {
  const router = Router();
  router.post('/identify', asyncHandler(controller.identify));
  router.post('/metadata', asyncHandler(controller.metadata));
  router.post('/chapter-list', asyncHandler(controller.chapterList));
  router.post('/chapter-content', asyncHandler(controller.chapterContent));
  return router;
}
```

```ts
// source-reader.module.ts
presentation: { controller: new SourceReaderController(api) }
```

```ts
// app-container.ts
sourceReader: sourceReader.presentation.controller
```

```ts
// app.ts
import { createSourceReaderRoutes } from './modules/source-reader/presentation/routes/source-reader.routes.js';
app.use('/api/source-reader', createSourceReaderRoutes(container.presentation.sourceReader));
```

- [ ] **Step 6: Map SourceReaderError in the error middleware**

```ts
// Add before the generic branch in apps/api/src/app/http/error-middleware.ts
if (error instanceof SourceReaderError) {
  const status =
    error.code === 'SOURCE_NOT_SUPPORTED' || error.code === 'CAPABILITY_NOT_SUPPORTED'
      ? 422
      : error.code === 'SOURCE_READER_CANCELLED'
        ? 499
        : 502;
  return fail(res, status, error.code, error.message, error.details ?? null);
}
```

- [ ] **Step 7: Run HTTP integration and API smoke tests**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test \
  tests/integration/source-reader-http.test.ts \
  tests/integration/api-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit reader HTTP preview**

```bash
git add apps/api/src/modules/source-reader/presentation apps/api/src/shared/container/modules/source-reader.module.ts apps/api/src/shared/container/app-container.ts apps/api/src/app.ts apps/api/src/app/http/error-middleware.ts tests/integration/source-reader-http.test.ts
git commit -m "feat(source-reader): expose reader preview API"
```

---

### Task 5: Delete all legacy source-profile and old plugin execution code

**Files:**
- Delete: `apps/api/src/modules/crawler/application/ports/source-adapter.port.ts`
- Delete: `apps/api/src/modules/crawler/application/ports/source-detector.port.ts`
- Delete: `apps/api/src/modules/crawler/application/ports/crawler-engine.port.ts`
- Delete: `apps/api/src/modules/crawler/application/services/source-detector.service.ts`
- Delete: `apps/api/src/modules/crawler/application/services/crawler-engine.service.ts`
- Delete: `apps/api/src/modules/crawler/domain/source/source-profile-schema.ts`
- Delete: `apps/api/src/modules/crawler/domain/source/source-profile.ts`
- Delete: `apps/api/src/modules/crawler/domain/source/url-normalizer.ts`
- Delete: `apps/api/src/modules/crawler/infrastructure/source/json-source-profile.repository.ts`
- Delete: `apps/api/src/modules/crawler/infrastructure/sources/plugin-source.adapter.ts`
- Delete: `apps/api/src/modules/crawler/infrastructure/sources/selector-html.adapter.ts`
- Delete: `apps/api/src/modules/plugin/`
- Delete: `apps/api/src/shared/container/modules/plugin.module.ts`
- Delete: `apps/api/config/source-profiles.json`
- Modify: `apps/api/src/shared/config/env.ts`
- Modify: `apps/api/src/shared/container/app-container.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modules/crawler/presentation/controllers/crawl-job.controller.ts`
- Modify: `apps/api/src/modules/crawler/presentation/routes/crawl.routes.ts`
- Test: `tests/regression/source-reader-legacy-removal.test.ts`
- Delete: `tests/regression/novelcool-source-profile.test.ts`
- Delete: `tests/regression/source-plugin-platform.test.ts`
- Delete: `tests/integration/source-plugin-platform.test.ts`

**Interfaces:**
- Consumes: Source Reader cutover completed by Tasks 1–4.
- Produces: repository with no old source execution path and no `/api/plugins` backend route.

- [ ] **Step 1: Write the failing legacy-removal regression test**

```ts
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const paths = [
  'apps/api/src/modules/plugin',
  'apps/api/src/modules/crawler/domain/source',
  'apps/api/src/modules/crawler/infrastructure/source',
  'apps/api/src/modules/crawler/infrastructure/sources/plugin-source.adapter.ts',
  'apps/api/src/modules/crawler/infrastructure/sources/selector-html.adapter.ts',
  'apps/api/config/source-profiles.json',
  'apps/api/src/shared/container/modules/plugin.module.ts'
];

test('legacy source profile and plugin paths are deleted', () => {
  for (const path of paths) assert.equal(existsSync(path), false, path);
  const app = readFileSync('apps/api/src/app.ts', 'utf8');
  const container = readFileSync('apps/api/src/shared/container/app-container.ts', 'utf8');
  const env = readFileSync('apps/api/src/shared/config/env.ts', 'utf8');
  assert.doesNotMatch(app, /\/api\/plugins|createSourcePluginRoutes/);
  assert.doesNotMatch(container, /createPluginModule|plugins\.lifecycle/);
  assert.doesNotMatch(env, /sourceProfilesFile|sourcesDir|genericHtmlAdapterEnabled/);
});
```

- [ ] **Step 2: Run the test and verify it fails for existing paths**

Run:

```bash
node --import tsx --test tests/regression/source-reader-legacy-removal.test.ts
```

Expected: FAIL because the legacy files still exist.

- [ ] **Step 3: Remove source-profile listing from crawl controller and routes**

```ts
// CrawlJobController constructor no longer accepts ListSourceProfilesUseCase.
// Delete the `sources` handler from CrawlJobController.
// Delete the corresponding route from createCrawlRoutes:
// router.get('/sources', asyncHandler(controller.sources));
```

- [ ] **Step 4: Remove legacy module wiring**

```ts
// apps/api/src/shared/container/app-container.ts
// Delete createPluginModule import, plugin creation, lifecycle start/stop, and presentation.plugins.
```

```ts
// apps/api/src/app.ts
// Delete createSourcePluginRoutes import and:
// app.use('/api/plugins', createSourcePluginRoutes(container.presentation.plugins));
```

```ts
// apps/api/src/shared/config/env.ts
// Delete genericHtmlAdapterEnabled, sourceProfilesFile, and sourcesDir.
```

- [ ] **Step 5: Delete the legacy files and obsolete tests**

Run:

```bash
rm -rf \
  apps/api/src/modules/plugin \
  apps/api/src/modules/crawler/domain/source \
  apps/api/src/modules/crawler/infrastructure/source
rm -f \
  apps/api/src/modules/crawler/application/ports/source-adapter.port.ts \
  apps/api/src/modules/crawler/application/ports/source-detector.port.ts \
  apps/api/src/modules/crawler/application/ports/crawler-engine.port.ts \
  apps/api/src/modules/crawler/application/services/source-detector.service.ts \
  apps/api/src/modules/crawler/application/services/crawler-engine.service.ts \
  apps/api/src/modules/crawler/infrastructure/sources/plugin-source.adapter.ts \
  apps/api/src/modules/crawler/infrastructure/sources/selector-html.adapter.ts \
  apps/api/src/shared/container/modules/plugin.module.ts \
  apps/api/config/source-profiles.json \
  tests/regression/novelcool-source-profile.test.ts \
  tests/regression/source-plugin-platform.test.ts \
  tests/integration/source-plugin-platform.test.ts
```

- [ ] **Step 6: Search for forbidden legacy symbols and remove every remaining reference**

Run:

```bash
rg -n "SourceProfile|JsonSourceProfileRepository|SourceDetectorService|CrawlerEngineService|SelectorHtmlAdapter|PluginSourceAdapter|SourceAdapter|createPluginModule|/api/plugins|SOURCE_PROFILES_FILE|SOURCES_DIR" apps tests scripts docs README.md
```

Expected: no code/test matches. Historical changelog/spec references may remain only when explicitly describing removed behavior; production source must have zero matches.

- [ ] **Step 7: Run removal test, architecture check, regression, integration, and build**

Run:

```bash
node --import tsx --test tests/regression/source-reader-legacy-removal.test.ts
npm run check:arch
npm run check:crawler
npm run test:regression
npm run test:integration
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit irreversible cutover**

```bash
git add -A
git commit -m "refactor(source-reader): remove legacy source paths"
```

## Plan completion gate

Run:

```bash
npm run verify
```

Expected: exit `0`. `apps/api/config/source-profiles.json`, `apps/api/src/modules/plugin`, and every old adapter/detector/engine file are absent. Analyze and chapter fetch both pass through `SourceReaderApi`.
