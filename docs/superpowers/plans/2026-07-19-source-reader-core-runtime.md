# Source Reader Core Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, testable Source Reader core that selects capability-specific plugins and reads NovelCool through a built-in plugin without integrating crawler or deleting legacy code yet.

**Architecture:** Define the public façade first, then implement manifest validation, matching, registry selection, a constrained in-process runtime, normalized result validation, signed cursors, and scope-aware memory caching. Port the existing NovelCool selectors into a built-in plugin that uses only `PluginContext` services.

**Tech Stack:** TypeScript 5.5, Node.js 22, Node test runner, Zod 3, Axios adapter, Cheerio adapter, Web Crypto/`node:crypto` HMAC.

## Global Constraints

- Consumers may import only `apps/api/src/modules/source-reader/public/*`.
- Capability names are exactly `identify`, `metadata`, `chapter-list`, `chapter-content`, `search`, `latest-updates`, and `authentication`.
- Built-in and external plugins share one `SourceReaderPlugin` contract.
- A plugin method is required only when its capability is declared.
- Plugin matching is per capability and uses host, include/exclude path patterns, priority, and optional `canHandle`.
- The core result contains normalized `data`, plugin provenance, optional versioned extensions, and warnings.
- No crawler, novel, chapter, task, database, browser, credential, or network-profile persistence is added in this plan.
- Do not add a legacy adapter or a feature flag.

---

### Task 1: Public contracts and stable error model

**Files:**
- Create: `apps/api/src/modules/source-reader/public/source-reader.models.ts`
- Create: `apps/api/src/modules/source-reader/public/source-reader.api.ts`
- Create: `apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts`
- Test: `tests/regression/source-reader-public-contract.test.ts`

**Interfaces:**
- Consumes: `AbortSignal` and plain TypeScript values only.
- Produces: `SourceReaderApi`, all request/result models, `SourceReaderError`, `SourceReaderErrorCode`, and `SourceReaderWarning` used by every later task.

- [ ] **Step 1: Write the failing public-contract regression test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  SourceCapability,
  SourceReaderApi,
  SourceReaderResult
} from '../../apps/api/src/modules/source-reader/public/source-reader.api.ts';
import {
  SourceReaderError,
  type SourceReaderErrorCode
} from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

test('source reader exposes stable capability and result contracts', () => {
  const capabilities: SourceCapability[] = [
    'identify',
    'metadata',
    'chapter-list',
    'chapter-content',
    'search',
    'latest-updates',
    'authentication'
  ];
  assert.equal(capabilities.length, 7);

  const result: SourceReaderResult<{ title: string }> = {
    data: { title: 'Book' },
    source: {
      pluginId: 'demo',
      pluginVersion: '1.0.0',
      domain: 'example.test',
      capability: 'metadata'
    }
  };
  assert.equal(result.data.title, 'Book');

  const code: SourceReaderErrorCode = 'CAPABILITY_NOT_SUPPORTED';
  const error = new SourceReaderError(code, 'Missing capability', {
    retryable: false,
    fallbackAllowed: false
  });
  assert.equal(error.code, code);
  assert.equal(error.retryable, false);
  assert.equal(error.fallbackAllowed, false);

  const api = null as SourceReaderApi | null;
  assert.equal(api, null);
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```bash
node --import tsx --test tests/regression/source-reader-public-contract.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `modules/source-reader/public/source-reader.api.ts`.

- [ ] **Step 3: Implement the normalized public models**

```ts
// apps/api/src/modules/source-reader/public/source-reader.models.ts
export type SourceCapability =
  | 'identify'
  | 'metadata'
  | 'chapter-list'
  | 'chapter-content'
  | 'search'
  | 'latest-updates'
  | 'authentication';

export type CacheScope = 'public' | 'account' | 'user' | 'session' | 'none';

export interface SourceReaderRequestContext {
  userId?: string;
  credentialProfileId?: string;
  networkProfileId?: string;
  freshOnly?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface IdentifyRequest extends SourceReaderRequestContext {
  url: string;
}

export interface ReadMetadataRequest extends SourceReaderRequestContext {
  url: string;
}

export interface ReadChapterListRequest extends SourceReaderRequestContext {
  url: string;
  cursor?: string;
  limit?: number;
}

export interface StreamChapterListRequest extends SourceReaderRequestContext {
  url: string;
  batchSize?: number;
}

export interface ReadChapterContentRequest extends SourceReaderRequestContext {
  url: string;
}

export interface SearchSourceRequest extends SourceReaderRequestContext {
  url: string;
  query: string;
  cursor?: string;
  limit?: number;
}

export interface LatestUpdatesRequest extends SourceReaderRequestContext {
  url: string;
  cursor?: string;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface SourceIdentity {
  normalizedUrl: string;
  domain: string;
  pageType: 'novel' | 'chapter' | 'search' | 'latest' | 'unknown';
}

export interface NovelMetadata {
  title: string;
  sourceUrl: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  status?: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
}

export interface ChapterSummary {
  index: number;
  title: string;
  url: string;
  publishedAt?: string;
}

export interface ChapterContent {
  title: string;
  url: string;
  rawText: string;
  cleanText: string;
}

export interface NovelSearchResult {
  title: string;
  url: string;
  author?: string;
  coverUrl?: string;
}

export interface LatestUpdate {
  novelTitle: string;
  novelUrl: string;
  chapterTitle?: string;
  chapterUrl?: string;
  updatedAt?: string;
}

export interface VersionedExtensionValue {
  version: number;
  data: unknown;
}

export interface SourceReaderWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SourceReaderResult<TData> {
  data: TData;
  source: {
    pluginId: string;
    pluginVersion: string;
    domain: string;
    capability: SourceCapability;
  };
  extensions?: Record<string, VersionedExtensionValue>;
  warnings?: SourceReaderWarning[];
}
```

- [ ] **Step 4: Implement the public façade and error class**

```ts
// apps/api/src/modules/source-reader/public/source-reader.api.ts
export type {
  CacheScope,
  ChapterContent,
  ChapterSummary,
  IdentifyRequest,
  LatestUpdate,
  LatestUpdatesRequest,
  NovelMetadata,
  NovelSearchResult,
  Page,
  ReadChapterContentRequest,
  ReadChapterListRequest,
  ReadMetadataRequest,
  SearchSourceRequest,
  SourceCapability,
  SourceIdentity,
  SourceReaderRequestContext,
  SourceReaderResult,
  SourceReaderWarning,
  StreamChapterListRequest,
  VersionedExtensionValue
} from './source-reader.models.js';

import type {
  ChapterContent,
  ChapterSummary,
  IdentifyRequest,
  LatestUpdate,
  LatestUpdatesRequest,
  NovelMetadata,
  NovelSearchResult,
  Page,
  ReadChapterContentRequest,
  ReadChapterListRequest,
  ReadMetadataRequest,
  SearchSourceRequest,
  SourceIdentity,
  SourceReaderResult,
  StreamChapterListRequest
} from './source-reader.models.js';

export interface SourceReaderApi {
  identify(request: IdentifyRequest): Promise<SourceReaderResult<SourceIdentity>>;
  readMetadata(request: ReadMetadataRequest): Promise<SourceReaderResult<NovelMetadata>>;
  readChapterList(
    request: ReadChapterListRequest
  ): Promise<SourceReaderResult<Page<ChapterSummary>>>;
  streamChapterList(
    request: StreamChapterListRequest
  ): AsyncIterable<SourceReaderResult<ChapterSummary[]>>;
  readChapterContent(
    request: ReadChapterContentRequest
  ): Promise<SourceReaderResult<ChapterContent>>;
  search(
    request: SearchSourceRequest
  ): Promise<SourceReaderResult<Page<NovelSearchResult>>>;
  latestUpdates(
    request: LatestUpdatesRequest
  ): Promise<SourceReaderResult<Page<LatestUpdate>>>;
}
```

```ts
// apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts
export type SourceReaderErrorCode =
  | 'SOURCE_NOT_SUPPORTED'
  | 'CAPABILITY_NOT_SUPPORTED'
  | 'PLUGIN_UNAVAILABLE'
  | 'PLUGIN_DISABLED'
  | 'PLUGIN_QUARANTINED'
  | 'PLUGIN_CONTRACT_INCOMPATIBLE'
  | 'PLUGIN_PERMISSION_DENIED'
  | 'PLUGIN_NETWORK_PERMISSION_DENIED'
  | 'PLUGIN_RESULT_INVALID'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_FAILED'
  | 'CREDENTIAL_NOT_CONFIGURED'
  | 'SESSION_EXPIRED'
  | 'SESSION_NETWORK_MISMATCH'
  | 'AUTH_CHALLENGE_REQUIRED'
  | 'AUTH_CHALLENGE_EXPIRED'
  | 'NETWORK_ROUTE_REQUIRED'
  | 'NETWORK_REGION_UNAVAILABLE'
  | 'NETWORK_ROUTE_OFFLINE'
  | 'NETWORK_ACCESS_BLOCKED'
  | 'SOURCE_REQUEST_TIMEOUT'
  | 'SOURCE_RESPONSE_TOO_LARGE'
  | 'SOURCE_RATE_LIMITED'
  | 'SOURCE_TEMPORARILY_UNAVAILABLE'
  | 'CURSOR_INVALID'
  | 'CURSOR_INVALIDATED'
  | 'SECRET_VAULT_UNAVAILABLE'
  | 'SOURCE_READER_CANCELLED'
  | 'SOURCE_READER_INTERNAL_ERROR';

export interface SourceReaderErrorOptions {
  retryable: boolean;
  fallbackAllowed: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class SourceReaderError extends Error {
  readonly code: SourceReaderErrorCode;
  readonly retryable: boolean;
  readonly fallbackAllowed: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: SourceReaderErrorCode, message: string, options: SourceReaderErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'SourceReaderError';
    this.code = code;
    this.retryable = options.retryable;
    this.fallbackAllowed = options.fallbackAllowed;
    this.details = options.details;
  }
}
```

- [ ] **Step 5: Run the focused test and API typecheck**

Run:

```bash
node --import tsx --test tests/regression/source-reader-public-contract.test.ts
npm run check -w @novel-tool/api
```

Expected: both commands PASS.

- [ ] **Step 6: Commit the public boundary**

```bash
git add apps/api/src/modules/source-reader/public apps/api/src/modules/source-reader/domain/errors tests/regression/source-reader-public-contract.test.ts
git commit -m "feat(source-reader): define public contracts"
```

---

### Task 2: Plugin manifest, capability contract, and shared contract suite

**Files:**
- Create: `apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts`
- Create: `apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts`
- Create: `tests/helpers/source-reader-plugin-contract.ts`
- Test: `tests/regression/source-reader-plugin-contract.test.ts`

**Interfaces:**
- Consumes: public capability/result models from Task 1.
- Produces: `SourceReaderPlugin`, `SourcePluginManifest`, `PluginContext`, plugin request/result types, and `parseSourcePluginManifest()` used by registry and package loading.

- [ ] **Step 1: Write failing manifest and capability tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSourcePluginManifest
} from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts';
import {
  assertPluginContract
} from '../helpers/source-reader-plugin-contract.ts';

test('manifest accepts independent capability contracts and matchers', () => {
  const manifest = parseSourcePluginManifest({
    id: 'demo-reader',
    name: 'Demo Reader',
    version: '1.0.0',
    engines: { sourceReader: '>=1.0.0 <2.0.0' },
    capabilities: ['metadata'],
    contracts: { metadata: 1 },
    matchers: [{ hosts: ['example.test'], capabilities: ['metadata'], priority: 100 }],
    runtime: { preferredMode: 'in-process' },
    permissions: { network: { hosts: ['example.test'] } }
  });
  assert.deepEqual(manifest.capabilities, ['metadata']);
});

test('declared capability requires its method but undeclared methods do not', () => {
  assert.throws(
    () =>
      assertPluginContract({
        manifest: parseSourcePluginManifest({
          id: 'broken',
          name: 'Broken',
          version: '1.0.0',
          engines: { sourceReader: '>=1.0.0 <2.0.0' },
          capabilities: ['chapter-content'],
          contracts: { 'chapter-content': 1 },
          matchers: [{ hosts: ['example.test'], priority: 1 }],
          runtime: { preferredMode: 'in-process' },
          permissions: { network: { hosts: ['example.test'] } }
        })
      }),
    /readChapterContent/
  );
});
```

- [ ] **Step 2: Run the focused test and verify missing modules**

Run:

```bash
node --import tsx --test tests/regression/source-reader-plugin-contract.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the plugin contract**

```ts
// apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts
import type {
  ChapterContent,
  ChapterSummary,
  LatestUpdate,
  NovelMetadata,
  NovelSearchResult,
  Page,
  SourceCapability,
  SourceIdentity,
  SourceReaderWarning,
  VersionedExtensionValue
} from '../../public/source-reader.models.js';

export type PluginExecutionMode = 'in-process' | 'isolated';
export type PluginTrustLevel = 'built-in' | 'signed' | 'local-unverified' | 'blocked';
export type PluginStatus =
  | 'installed'
  | 'pending-approval'
  | 'initializing'
  | 'active'
  | 'degraded'
  | 'disabled'
  | 'quarantined'
  | 'failed';

export interface PluginMatcher {
  hosts: string[];
  include?: string[];
  exclude?: string[];
  capabilities?: SourceCapability[];
  priority: number;
}

export interface SourcePluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  engines: { sourceReader: string };
  capabilities: SourceCapability[];
  contracts: Partial<Record<SourceCapability, number>>;
  matchers: PluginMatcher[];
  runtime: { preferredMode: PluginExecutionMode; requiresBrowser?: boolean };
  permissions: {
    network: { hosts: string[] };
    browser?: boolean;
    authentication?: boolean;
    persistentCache?: boolean;
    externalAssets?: string[];
  };
  runtimeRequirements?: {
    authentication?: {
      required: boolean;
      methods: Array<'cookie-import' | 'bearer-token' | 'basic-auth' | 'form-login' | 'custom'>;
    };
    network?: {
      required: boolean;
      regions?: string[];
      routeTags?: string[];
      allowDirectFallback: boolean;
    };
  };
  extensionContracts?: Record<
    string,
    { version: number; schema: string; required?: boolean }
  >;
}

export interface PluginHttpResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  data: string;
}

export interface PluginHtmlNode {
  text(selector?: string): string;
  attr(name: string): string | undefined;
  html(selector?: string): string;
}

export interface PluginHtmlDocument {
  text(selector: string): string;
  attr(selector: string, name: string): string | undefined;
  html(selector: string): string;
  all(selector: string): PluginHtmlNode[];
  remove(selector: string): void;
}

export interface PluginContext {
  http: {
    get(
      url: string,
      options?: { headers?: Record<string, string>; timeoutMs?: number }
    ): Promise<PluginHttpResponse>;
  };
  html: { load(source: string): PluginHtmlDocument };
  url: { normalize(value: string): string; resolve(value: string, base: string): string };
  cache: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  };
  logger: {
    info(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
  };
  clock: { now(): string };
  signal: AbortSignal;
}

export interface PluginMatchRequest {
  url: string;
  normalizedUrl: string;
  domain: string;
  capability: SourceCapability;
}

export interface PluginOperationResult<T> {
  data: T;
  extensions?: Record<string, VersionedExtensionValue>;
  warnings?: SourceReaderWarning[];
  cacheHints?: {
    scope?: 'public' | 'account' | 'user' | 'session' | 'none';
    ttlMs?: number;
    staleWhileRevalidateMs?: number;
    immutable?: boolean;
    tags?: string[];
  };
}

export interface SourceReaderPlugin {
  manifest: SourcePluginManifest;
  canHandle?(request: PluginMatchRequest, context: PluginContext): boolean | Promise<boolean>;
  identify?(
    request: { url: string },
    context: PluginContext
  ): Promise<PluginOperationResult<SourceIdentity>>;
  readMetadata?(
    request: { url: string },
    context: PluginContext
  ): Promise<PluginOperationResult<NovelMetadata>>;
  readChapterList?(
    request: { url: string; cursor?: string; limit: number },
    context: PluginContext
  ): Promise<PluginOperationResult<Page<ChapterSummary>>>;
  readChapterContent?(
    request: { url: string },
    context: PluginContext
  ): Promise<PluginOperationResult<ChapterContent>>;
  search?(
    request: { url: string; query: string; cursor?: string; limit: number },
    context: PluginContext
  ): Promise<PluginOperationResult<Page<NovelSearchResult>>>;
  latestUpdates?(
    request: { url: string; cursor?: string; limit: number },
    context: PluginContext
  ): Promise<PluginOperationResult<Page<LatestUpdate>>>;
}
```

- [ ] **Step 4: Implement manifest validation**

```ts
// apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts
import { z } from 'zod';
import type { SourcePluginManifest } from './source-plugin.js';

const capability = z.enum([
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content',
  'search',
  'latest-updates',
  'authentication'
]);

const manifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
    description: z.string().optional(),
    engines: z.object({ sourceReader: z.string().min(1) }),
    capabilities: z.array(capability).min(1),
    contracts: z.record(capability, z.number().int().positive()).default({}),
    matchers: z
      .array(
        z.object({
          hosts: z.array(z.string().min(1)).min(1),
          include: z.array(z.string().min(1)).optional(),
          exclude: z.array(z.string().min(1)).optional(),
          capabilities: z.array(capability).optional(),
          priority: z.number().int()
        })
      )
      .min(1),
    runtime: z.object({
      preferredMode: z.enum(['in-process', 'isolated']),
      requiresBrowser: z.boolean().optional()
    }),
    permissions: z.object({
      network: z.object({ hosts: z.array(z.string().min(1)).min(1) }),
      browser: z.boolean().optional(),
      authentication: z.boolean().optional(),
      persistentCache: z.boolean().optional(),
      externalAssets: z.array(z.string().min(1)).optional()
    }),
    runtimeRequirements: z
      .object({
        authentication: z
          .object({
            required: z.boolean(),
            methods: z
              .array(
                z.enum([
                  'cookie-import',
                  'bearer-token',
                  'basic-auth',
                  'form-login',
                  'custom'
                ])
              )
              .min(1)
          })
          .optional(),
        network: z
          .object({
            required: z.boolean(),
            regions: z.array(z.string().min(2)).optional(),
            routeTags: z.array(z.string().min(1)).optional(),
            allowDirectFallback: z.boolean()
          })
          .optional()
      })
      .optional(),
    extensionContracts: z
      .record(
        z.string().min(1),
        z.object({
          version: z.number().int().positive(),
          schema: z.string().min(1),
          required: z.boolean().optional()
        })
      )
      .optional()
  })
  .superRefine((manifest, context) => {
    for (const item of manifest.capabilities) {
      if (item === 'authentication') continue;
      if (!manifest.contracts[item]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contracts', item],
          message: `Missing contract version for ${item}`
        });
      }
    }
  });

export function parseSourcePluginManifest(input: unknown): SourcePluginManifest {
  return manifestSchema.parse(input) as SourcePluginManifest;
}
```

- [ ] **Step 5: Implement the reusable plugin contract assertion**

```ts
// tests/helpers/source-reader-plugin-contract.ts
import assert from 'node:assert/strict';
import type {
  SourceReaderPlugin
} from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';

const methodByCapability = {
  identify: 'identify',
  metadata: 'readMetadata',
  'chapter-list': 'readChapterList',
  'chapter-content': 'readChapterContent',
  search: 'search',
  'latest-updates': 'latestUpdates',
  authentication: 'authentication'
} as const;

export function assertPluginContract(plugin: SourceReaderPlugin): void {
  for (const capability of plugin.manifest.capabilities) {
    const method = methodByCapability[capability];
    if (capability === 'authentication') continue;
    assert.equal(
      typeof plugin[method],
      'function',
      `${plugin.manifest.id} declares ${capability} but does not implement ${method}`
    );
  }
}
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
node --import tsx --test tests/regression/source-reader-plugin-contract.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit the plugin contract**

```bash
git add apps/api/src/modules/source-reader/domain/plugin tests/helpers/source-reader-plugin-contract.ts tests/regression/source-reader-plugin-contract.test.ts
git commit -m "feat(source-reader): define plugin capability contract"
```

---

### Task 3: URL matching and per-capability registry

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/plugin-registry.port.ts`
- Create: `apps/api/src/modules/source-reader/application/services/plugin-matcher.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts`
- Test: `tests/regression/source-reader-plugin-registry.test.ts`

**Interfaces:**
- Consumes: `SourceReaderPlugin`, `PluginMatcher`, `SourceCapability`.
- Produces: `PluginRegistryPort.listCandidates(request)` returning ordered plugin registrations for Task 6.

- [ ] **Step 1: Write failing matcher and registry tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPluginRegistry } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import type { SourceReaderPlugin } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';

const plugin = (
  id: string,
  priority: number,
  capability: 'metadata' | 'chapter-content',
  include?: string[]
): SourceReaderPlugin => ({
  manifest: {
    id,
    name: id,
    version: '1.0.0',
    engines: { sourceReader: '>=1.0.0 <2.0.0' },
    capabilities: [capability],
    contracts: { [capability]: 1 },
    matchers: [
      {
        hosts: ['example.test'],
        include,
        exclude: ['/account/**'],
        capabilities: [capability],
        priority
      }
    ],
    runtime: { preferredMode: 'in-process' },
    permissions: { network: { hosts: ['example.test'] } }
  },
  ...(capability === 'metadata'
    ? { readMetadata: async () => ({ data: { title: id, sourceUrl: '', sourceName: id } }) }
    : {
        readChapterContent: async () => ({
          data: { title: id, url: '', rawText: 'raw', cleanText: 'clean' }
        })
      })
});

test('registry composes one domain by capability and priority', async () => {
  const registry = new InMemoryPluginRegistry();
  registry.register(plugin('low', 10, 'metadata'));
  registry.register(plugin('high', 100, 'metadata', ['/novel/**']));
  registry.register(plugin('content', 50, 'chapter-content', ['/chapter/**']));

  const metadata = await registry.listCandidates({
    url: 'https://www.example.test/novel/book',
    capability: 'metadata'
  });
  assert.deepEqual(metadata.map((candidate) => candidate.plugin.manifest.id), ['high', 'low']);

  const content = await registry.listCandidates({
    url: 'https://example.test/chapter/1',
    capability: 'chapter-content'
  });
  assert.deepEqual(content.map((candidate) => candidate.plugin.manifest.id), ['content']);

  const excluded = await registry.listCandidates({
    url: 'https://example.test/account/profile',
    capability: 'metadata'
  });
  assert.deepEqual(excluded, []);
});
```

- [ ] **Step 2: Run the test and verify the missing registry failure**

Run:

```bash
node --import tsx --test tests/regression/source-reader-plugin-registry.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define the registry port**

```ts
// apps/api/src/modules/source-reader/application/ports/plugin-registry.port.ts
import type { SourceCapability } from '../../public/source-reader.models.js';
import type {
  PluginExecutionMode,
  PluginTrustLevel,
  SourceReaderPlugin
} from '../../domain/plugin/source-plugin.js';

export interface RegisteredPlugin {
  plugin: SourceReaderPlugin;
  trustLevel: PluginTrustLevel;
  executionMode: PluginExecutionMode;
  enabled: boolean;
}

export interface PluginCandidate extends RegisteredPlugin {
  priority: number;
  normalizedUrl: string;
  domain: string;
}

export interface PluginRegistryPort {
  register(
    plugin: SourceReaderPlugin,
    options?: Partial<Omit<RegisteredPlugin, 'plugin'>>
  ): void;
  unregister(pluginId: string): void;
  listCandidates(request: {
    url: string;
    capability: SourceCapability;
  }): Promise<PluginCandidate[]>;
}
```

- [ ] **Step 4: Implement host/path matching**

```ts
// apps/api/src/modules/source-reader/application/services/plugin-matcher.ts
import type { PluginMatcher } from '../../domain/plugin/source-plugin.js';
import type { SourceCapability } from '../../public/source-reader.models.js';

export function normalizeSourceUrl(value: string): string {
  const url = new URL(value);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  return url.toString();
}

function hostMatches(host: string, pattern: string): boolean {
  const normalized = pattern.toLowerCase().replace(/^www\./, '');
  if (normalized.startsWith('*.')) {
    const suffix = normalized.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === normalized || host.endsWith(`.${normalized}`);
}

function globMatches(pathname: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '___DOUBLE_STAR___')
    .replaceAll('*', '[^/]*')
    .replaceAll('___DOUBLE_STAR___', '.*');
  return new RegExp(`^${escaped}$`).test(pathname);
}

export function matcherAccepts(
  matcher: PluginMatcher,
  request: { url: string; capability: SourceCapability }
): boolean {
  const normalizedUrl = normalizeSourceUrl(request.url);
  const url = new URL(normalizedUrl);
  if (!matcher.hosts.some((host) => hostMatches(url.hostname, host))) return false;
  if (matcher.capabilities && !matcher.capabilities.includes(request.capability)) return false;
  if (matcher.exclude?.some((pattern) => globMatches(url.pathname, pattern))) return false;
  if (matcher.include && !matcher.include.some((pattern) => globMatches(url.pathname, pattern)))
    return false;
  return true;
}
```

- [ ] **Step 5: Implement the in-memory registry**

```ts
// apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts
import type {
  PluginCandidate,
  PluginRegistryPort,
  RegisteredPlugin
} from '../../../application/ports/plugin-registry.port.js';
import { matcherAccepts, normalizeSourceUrl } from '../../../application/services/plugin-matcher.js';
import type { SourceReaderPlugin } from '../../../domain/plugin/source-plugin.js';
import type { SourceCapability } from '../../../public/source-reader.models.js';

export class InMemoryPluginRegistry implements PluginRegistryPort {
  private readonly registrations = new Map<string, RegisteredPlugin>();

  register(
    plugin: SourceReaderPlugin,
    options: Partial<Omit<RegisteredPlugin, 'plugin'>> = {}
  ): void {
    if (this.registrations.has(plugin.manifest.id)) {
      throw new Error(`Duplicate source plugin id: ${plugin.manifest.id}`);
    }
    this.registrations.set(plugin.manifest.id, {
      plugin,
      trustLevel: options.trustLevel ?? 'built-in',
      executionMode: options.executionMode ?? plugin.manifest.runtime.preferredMode,
      enabled: options.enabled ?? true
    });
  }

  unregister(pluginId: string): void {
    this.registrations.delete(pluginId);
  }

  async listCandidates(request: {
    url: string;
    capability: SourceCapability;
  }): Promise<PluginCandidate[]> {
    const normalizedUrl = normalizeSourceUrl(request.url);
    const domain = new URL(normalizedUrl).hostname;
    const candidates: PluginCandidate[] = [];

    for (const registration of this.registrations.values()) {
      if (!registration.enabled) continue;
      if (!registration.plugin.manifest.capabilities.includes(request.capability)) continue;
      const matching = registration.plugin.manifest.matchers.filter((matcher) =>
        matcherAccepts(matcher, request)
      );
      if (matching.length === 0) continue;
      candidates.push({
        ...registration,
        priority: Math.max(...matching.map((matcher) => matcher.priority)),
        normalizedUrl,
        domain
      });
    }

    return candidates.sort(
      (left, right) =>
        right.priority - left.priority ||
        left.plugin.manifest.id.localeCompare(right.plugin.manifest.id)
    );
  }
}
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
node --import tsx --test tests/regression/source-reader-plugin-registry.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit registry selection**

```bash
git add apps/api/src/modules/source-reader/application apps/api/src/modules/source-reader/infrastructure/plugins/registry tests/regression/source-reader-plugin-registry.test.ts
git commit -m "feat(source-reader): add capability plugin registry"
```

---

### Task 4: Constrained plugin context and in-process runtime

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/plugin-runtime.port.ts`
- Create: `apps/api/src/modules/source-reader/application/ports/plugin-context-factory.port.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts`
- Test: `tests/regression/source-reader-in-process-runtime.test.ts`

**Interfaces:**
- Consumes: shared `HttpClientPort`, `HtmlParserPort`, `ClockPort`, `LoggerPort`; plugin registrations from Task 3.
- Produces: `PluginRuntimePort.invoke()` and `PluginContextFactoryPort.create()` used by the Source Reader service.

- [ ] **Step 1: Write the failing runtime permission and cancellation tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { InProcessPluginRuntime } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts';
import { PluginContextFactory } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

const parser = {
  load: () => ({
    text: () => '',
    attr: () => undefined,
    html: () => '',
    queryAll: () => [],
    nodeText: () => '',
    nodeAttr: () => undefined,
    remove: () => undefined
  })
};
const clock = { now: () => '2026-07-19T00:00:00.000Z' };
const logger = { info() {}, warn() {}, error() {} };

test('plugin context blocks undeclared network hosts', async () => {
  const factory = new PluginContextFactory(
    { get: async () => ({ url: '', status: 200, headers: {}, data: '' }) } as never,
    parser,
    clock,
    logger
  );
  const context = factory.create({
    pluginId: 'demo',
    allowedHosts: ['example.test'],
    signal: new AbortController().signal
  });
  await assert.rejects(
    () => context.http.get('https://forbidden.test/book'),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_NETWORK_PERMISSION_DENIED'
  );
});

test('in-process runtime dispatches only the requested capability', async () => {
  const runtime = new InProcessPluginRuntime();
  const result = await runtime.invoke({
    registration: {
      plugin: {
        manifest: {
          id: 'demo',
          name: 'Demo',
          version: '1.0.0',
          engines: { sourceReader: '>=1.0.0 <2.0.0' },
          capabilities: ['metadata'],
          contracts: { metadata: 1 },
          matchers: [{ hosts: ['example.test'], priority: 1 }],
          runtime: { preferredMode: 'in-process' },
          permissions: { network: { hosts: ['example.test'] } }
        },
        readMetadata: async () => ({
          data: { title: 'Book', sourceUrl: 'https://example.test/book', sourceName: 'Demo' }
        })
      },
      trustLevel: 'built-in',
      executionMode: 'in-process',
      enabled: true
    },
    capability: 'metadata',
    request: { url: 'https://example.test/book' },
    context: {} as never
  });
  assert.equal((result.data as { title: string }).title, 'Book');
});
```

- [ ] **Step 2: Run the test and verify missing runtime modules**

Run:

```bash
node --import tsx --test tests/regression/source-reader-in-process-runtime.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define runtime and context-factory ports**

```ts
// apps/api/src/modules/source-reader/application/ports/plugin-runtime.port.ts
import type { RegisteredPlugin } from './plugin-registry.port.js';
import type {
  PluginContext,
  PluginOperationResult
} from '../../domain/plugin/source-plugin.js';
import type { SourceCapability } from '../../public/source-reader.models.js';

export interface PluginInvocation {
  registration: RegisteredPlugin;
  capability: SourceCapability;
  request: Record<string, unknown>;
  context: PluginContext;
}

export interface PluginRuntimePort {
  invoke(invocation: PluginInvocation): Promise<PluginOperationResult<unknown>>;
}
```

```ts
// apps/api/src/modules/source-reader/application/ports/plugin-context-factory.port.ts
import type { PluginContext } from '../../domain/plugin/source-plugin.js';

export interface PluginContextFactoryPort {
  create(input: {
    pluginId: string;
    allowedHosts: string[];
    signal: AbortSignal;
  }): PluginContext;
}
```

- [ ] **Step 4: Implement the constrained context factory**

```ts
// apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts
import type { ClockPort } from '../../../shared/ports/clock.port.js';
import type { HtmlParserPort } from '../../../shared/ports/html-parser.port.js';
import type { HttpClientPort } from '../../../shared/ports/http-client.port.js';
import type { LoggerPort } from '../../../shared/ports/logger.port.js';
import type { PluginContextFactoryPort } from '../../application/ports/plugin-context-factory.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { PluginContext, PluginHtmlDocument } from '../../domain/plugin/source-plugin.js';
import { normalizeSourceUrl } from '../../application/services/plugin-matcher.js';

function allowed(host: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const normalized = pattern.toLowerCase().replace(/^\*\./, '');
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

export class PluginContextFactory implements PluginContextFactoryPort {
  constructor(
    private readonly http: HttpClientPort,
    private readonly parser: HtmlParserPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort
  ) {}

  create(input: {
    pluginId: string;
    allowedHosts: string[];
    signal: AbortSignal;
  }): PluginContext {
    const memory = new Map<string, { expiresAt: number; value: unknown }>();
    return {
      http: {
        get: async (url, options) => {
          const host = new URL(url).hostname.toLowerCase();
          if (!allowed(host, input.allowedHosts)) {
            throw new SourceReaderError(
              'PLUGIN_NETWORK_PERMISSION_DENIED',
              `Plugin ${input.pluginId} cannot access ${host}`,
              { retryable: false, fallbackAllowed: false, details: { host } }
            );
          }
          if (input.signal.aborted) {
            throw new SourceReaderError('SOURCE_READER_CANCELLED', 'Request cancelled', {
              retryable: false,
              fallbackAllowed: false
            });
          }
          return this.http.get(url, { ...options, signal: input.signal });
        }
      },
      html: {
        load: (source): PluginHtmlDocument => {
          const document = this.parser.load(source);
          return {
            text: (selector) => document.text(selector),
            attr: (selector, name) => document.attr(selector, name),
            html: (selector) => document.html(selector),
            remove: (selector) => document.remove(selector),
            all: (selector) =>
              document.queryAll(selector).map((node) => ({
                text: (childSelector) =>
                  childSelector ? document.nodeText(node, childSelector) : document.nodeText(node),
                attr: (name) => document.nodeAttr(node, name),
                html: () => ''
              }))
          };
        }
      },
      url: {
        normalize: normalizeSourceUrl,
        resolve: (value, base) => new URL(value, base).toString()
      },
      cache: {
        get: async <T>(key: string) => {
          const item = memory.get(key);
          if (!item || item.expiresAt <= Date.now()) return undefined;
          return item.value as T;
        },
        set: async <T>(key: string, value: T, ttlMs: number) => {
          memory.set(key, { value, expiresAt: Date.now() + ttlMs });
        }
      },
      logger: {
        info: (message, metadata) => this.logger.info(`[${input.pluginId}] ${message}`, metadata),
        warn: (message, metadata) => this.logger.warn(`[${input.pluginId}] ${message}`, metadata)
      },
      clock: { now: () => this.clock.now().toISOString() },
      signal: input.signal
    };
  }
}
```

- [ ] **Step 5: Implement capability dispatch in the in-process runtime**

```ts
// apps/api/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts
import type {
  PluginInvocation,
  PluginRuntimePort
} from '../../../application/ports/plugin-runtime.port.js';
import { SourceReaderError } from '../../../domain/errors/source-reader.error.js';

const methodByCapability = {
  identify: 'identify',
  metadata: 'readMetadata',
  'chapter-list': 'readChapterList',
  'chapter-content': 'readChapterContent',
  search: 'search',
  'latest-updates': 'latestUpdates'
} as const;

export class InProcessPluginRuntime implements PluginRuntimePort {
  async invoke(invocation: PluginInvocation) {
    if (invocation.capability === 'authentication') {
      throw new SourceReaderError(
        'CAPABILITY_NOT_SUPPORTED',
        'Authentication is invoked through the authentication runtime',
        { retryable: false, fallbackAllowed: false }
      );
    }
    const methodName = methodByCapability[invocation.capability];
    const method = invocation.registration.plugin[methodName];
    if (typeof method !== 'function') {
      throw new SourceReaderError(
        'CAPABILITY_NOT_SUPPORTED',
        `${invocation.registration.plugin.manifest.id} does not implement ${invocation.capability}`,
        { retryable: false, fallbackAllowed: true }
      );
    }
    if (invocation.context.signal.aborted) {
      throw new SourceReaderError('SOURCE_READER_CANCELLED', 'Request cancelled', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    return method.call(invocation.registration.plugin, invocation.request as never, invocation.context);
  }
}
```

- [ ] **Step 6: Run runtime tests and typecheck**

Run:

```bash
node --import tsx --test tests/regression/source-reader-in-process-runtime.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit the in-process runtime**

```bash
git add apps/api/src/modules/source-reader/application/ports apps/api/src/modules/source-reader/infrastructure/runtime tests/regression/source-reader-in-process-runtime.test.ts
git commit -m "feat(source-reader): add constrained in-process runtime"
```

---

### Task 5: Built-in NovelCool plugin

**Files:**
- Create: `apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.manifest.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.parsers.ts`
- Test: `tests/regression/source-reader-novelcool-plugin.test.ts`
- Test fixture: `tests/fixtures/source-reader/novelcool-novel.html`
- Test fixture: `tests/fixtures/source-reader/novelcool-chapter.html`

**Interfaces:**
- Consumes: `SourceReaderPlugin`, `PluginContext`, and existing `sanitizeChapterText()`.
- Produces: `novelCoolPlugin` registered by the module composition plan.

- [ ] **Step 1: Create deterministic HTML fixtures from the selectors currently used by `source-profiles.json`**

```html
<!-- tests/fixtures/source-reader/novelcool-novel.html -->
<html>
  <head><title>Fixture</title></head>
  <body>
    <h1 class="novel-title">Fixture Novel</h1>
    <span class="author">Fixture Author</span>
    <img class="book-cover" src="/covers/fixture.jpg" />
    <div class="summary">Fixture description.</div>
    <div class="chapter-list">
      <a href="/chapter/fixture-chapter-2"><span>Chapter 2</span></a>
      <a href="/chapter/fixture-chapter-1"><span>Chapter 1</span></a>
    </div>
  </body>
</html>
```

```html
<!-- tests/fixtures/source-reader/novelcool-chapter.html -->
<html>
  <body>
    <h1 class="chapter-title">Chapter 1</h1>
    <div class="overflow-hidden">
      <span class="chapter-start-mark"></span>
      <p>This is the first paragraph of a sufficiently long fixture chapter.</p>
      <p>This is the second paragraph and it keeps the normalized text above the minimum.</p>
      <p>This is the third paragraph with additional deterministic fixture content for testing.</p>
      <p>This is the fourth paragraph with more readable words for the content sanitizer.</p>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Write failing built-in plugin tests**

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CheerioHtmlParserAdapter } from '../../apps/api/src/shared/infrastructure/html/cheerio-html-parser.adapter.ts';
import { novelCoolPlugin } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.ts';
import type { PluginContext } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';
import { assertPluginContract } from '../helpers/source-reader-plugin-contract.ts';

const novelHtml = await readFile('tests/fixtures/source-reader/novelcool-novel.html', 'utf8');
const chapterHtml = await readFile('tests/fixtures/source-reader/novelcool-chapter.html', 'utf8');
const parser = new CheerioHtmlParserAdapter();

const context = (html: string): PluginContext => ({
  http: {
    get: async (url) => ({ url, status: 200, headers: {}, data: html })
  },
  html: {
    load: (source) => {
      const document = parser.load(source);
      return {
        text: (selector) => document.text(selector),
        attr: (selector, name) => document.attr(selector, name),
        html: (selector) => document.html(selector),
        remove: (selector) => document.remove(selector),
        all: (selector) =>
          document.queryAll(selector).map((node) => ({
            text: (child) => (child ? document.nodeText(node, child) : document.nodeText(node)),
            attr: (name) => document.nodeAttr(node, name),
            html: () => ''
          }))
      };
    }
  },
  url: { normalize: (value) => value, resolve: (value, base) => new URL(value, base).toString() },
  cache: { get: async () => undefined, set: async () => undefined },
  logger: { info() {}, warn() {} },
  clock: { now: () => '2026-07-19T00:00:00.000Z' },
  signal: new AbortController().signal
});

test('NovelCool plugin satisfies declared capabilities', () => {
  assertPluginContract(novelCoolPlugin);
});

test('NovelCool plugin normalizes metadata and oldest-first chapters', async () => {
  const metadata = await novelCoolPlugin.readMetadata!(
    { url: 'https://www.novelcool.com/novel/fixture.html' },
    context(novelHtml)
  );
  assert.equal(metadata.data.title, 'Fixture Novel');
  assert.equal(metadata.data.author, 'Fixture Author');

  const chapters = await novelCoolPlugin.readChapterList!(
    { url: 'https://www.novelcool.com/novel/fixture.html', limit: 100 },
    context(novelHtml)
  );
  assert.deepEqual(chapters.data.items.map((item) => item.title), ['Chapter 1', 'Chapter 2']);
});

test('NovelCool plugin extracts and sanitizes chapter content', async () => {
  const result = await novelCoolPlugin.readChapterContent!(
    { url: 'https://www.novelcool.com/chapter/fixture-chapter-1.html' },
    context(chapterHtml)
  );
  assert.equal(result.data.title, 'Chapter 1');
  assert.ok(result.data.cleanText.length >= 200);
});
```

- [ ] **Step 3: Run the test and verify the missing plugin failure**

Run:

```bash
node --import tsx --test tests/regression/source-reader-novelcool-plugin.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implement the built-in manifest**

```ts
// apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.manifest.ts
import type { SourcePluginManifest } from '../../../../domain/plugin/source-plugin.js';

export const novelCoolManifest: SourcePluginManifest = {
  id: 'novelcool',
  name: 'NovelCool',
  version: '1.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['identify', 'metadata', 'chapter-list', 'chapter-content'],
  contracts: {
    identify: 1,
    metadata: 1,
    'chapter-list': 1,
    'chapter-content': 1
  },
  matchers: [
    {
      hosts: ['novelcool.com'],
      include: ['/novel/**', '/chapter/**'],
      exclude: ['/account/**', '/login/**'],
      priority: 100
    }
  ],
  runtime: { preferredMode: 'in-process' },
  permissions: {
    network: { hosts: ['novelcool.com', '*.novelcool.com'] }
  }
};
```

- [ ] **Step 5: Implement parsing helpers with no body fallback**

```ts
// apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.parsers.ts
import type { PluginHtmlDocument } from '../../../../domain/plugin/source-plugin.js';

export function cleanSourceText(value: string | undefined): string {
  return (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function firstText(document: PluginHtmlDocument, selectors: string[]): string {
  for (const selector of selectors) {
    const value = cleanSourceText(document.text(selector));
    if (value) return value;
  }
  return '';
}

export function firstAttr(
  document: PluginHtmlDocument,
  selectors: string[],
  attribute: string
): string | undefined {
  for (const selector of selectors) {
    const value = document.attr(selector, attribute)?.trim();
    if (value) return value;
  }
  return undefined;
}

export function chapterContent(document: PluginHtmlDocument): string {
  for (const selector of [
    '.overflow-hidden:has(.chapter-start-mark)',
    '.chapter-content',
    '#chapter-content',
    '.reading-content'
  ]) {
    const value = cleanSourceText(document.text(selector));
    if (value) return value;
  }
  return '';
}
```

- [ ] **Step 6: Implement the built-in plugin**

```ts
// apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.ts
import { env } from '../../../../../../shared/config/env.js';
import { sanitizeChapterText } from '../../../../../crawler/application/services/chapter-content-sanitizer.js';
import { SourceReaderError } from '../../../../domain/errors/source-reader.error.js';
import type { SourceReaderPlugin } from '../../../../domain/plugin/source-plugin.js';
import { novelCoolManifest } from './novelcool.manifest.js';
import { chapterContent, cleanSourceText, firstAttr, firstText } from './novelcool.parsers.js';

export const novelCoolPlugin: SourceReaderPlugin = {
  manifest: novelCoolManifest,

  async identify({ url }) {
    const normalized = new URL(url);
    normalized.hostname = normalized.hostname.toLowerCase().replace(/^www\./, '');
    return {
      data: {
        normalizedUrl: normalized.toString(),
        domain: normalized.hostname,
        pageType: normalized.pathname.includes('/chapter/') ? 'chapter' : 'novel'
      }
    };
  },

  async readMetadata({ url }, context) {
    const response = await context.http.get(url);
    const document = context.html.load(response.data);
    const title = firstText(document, ['h1.novel-title', 'h1', '.bookinfo h1']);
    if (title.length < 2) {
      throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'NovelCool title was not found', {
        retryable: false,
        fallbackAllowed: true,
        details: { url }
      });
    }
    const cover = firstAttr(document, ['img.book-cover', '.bookinfo img', '.cover img'], 'src');
    return {
      data: {
        title,
        sourceUrl: context.url.normalize(url),
        sourceName: 'NovelCool',
        author: firstText(document, ['.author', '.bookinfo .author']) || undefined,
        coverUrl: cover ? context.url.resolve(cover, url) : undefined,
        description: firstText(document, ['.summary', '.description', '#summary']) || undefined
      },
      cacheHints: { scope: 'public', ttlMs: 30 * 60_000, staleWhileRevalidateMs: 6 * 60 * 60_000 }
    };
  },

  async readChapterList({ url, cursor, limit }, context) {
    if (cursor) {
      throw new SourceReaderError('CURSOR_INVALID', 'NovelCool uses module-managed cursors', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    const response = await context.http.get(url);
    const document = context.html.load(response.data);
    const candidates = document
      .all('.chapter-list a, .chapter-list li a, #chapter-list a')
      .map((node, index) => ({
        index,
        title: cleanSourceText(node.text('span')) || cleanSourceText(node.text()) || `Chapter ${index + 1}`,
        url: node.attr('href') ? context.url.resolve(node.attr('href')!, url) : ''
      }))
      .filter((chapter) => chapter.url.length > 0)
      .reverse()
      .map((chapter, index) => ({ ...chapter, index: index + 1 }));
    if (candidates.length === 0) {
      throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'NovelCool chapter list is empty', {
        retryable: false,
        fallbackAllowed: true,
        details: { url }
      });
    }
    const items = candidates.slice(0, limit);
    return {
      data: { items, hasMore: candidates.length > items.length },
      cacheHints: { scope: 'public', ttlMs: 5 * 60_000, staleWhileRevalidateMs: 60 * 60_000 }
    };
  },

  async readChapterContent({ url }, context) {
    const response = await context.http.get(url);
    const document = context.html.load(response.data);
    const title = firstText(document, ['h1.chapter-title', '.chapter-title', 'h1']) || 'Chapter';
    document.remove('script,style,noscript,nav,header,footer,aside,form,button,.ads,.advertisement');
    const rawText = chapterContent(document);
    const cleanText = sanitizeChapterText(rawText, title);
    if (cleanText.length < env.minChapterContentChars) {
      throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'NovelCool chapter content is too short', {
        retryable: false,
        fallbackAllowed: true,
        details: {
          url,
          minChapterContentChars: env.minChapterContentChars,
          actualChars: cleanText.length
        }
      });
    }
    return {
      data: { title, url: context.url.normalize(url), rawText, cleanText },
      cacheHints: { scope: 'public', ttlMs: 30 * 24 * 60 * 60_000, immutable: true }
    };
  }
};
```

- [ ] **Step 7: Run built-in plugin tests and regression sanitizer test**

Run:

```bash
node --import tsx --test tests/regression/source-reader-novelcool-plugin.test.ts tests/regression/chapter-content-sanitizer.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 8: Commit the built-in plugin**

```bash
git add apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool tests/fixtures/source-reader tests/regression/source-reader-novelcool-plugin.test.ts
git commit -m "feat(source-reader): add built-in NovelCool plugin"
```

---

### Task 6: Source Reader service, fallback, result validation, cursors, streaming, and memory cache

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/reader-cache.port.ts`
- Create: `apps/api/src/modules/source-reader/application/ports/cursor-codec.port.ts`
- Create: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Create: `apps/api/src/modules/source-reader/application/services/plugin-result-validator.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/cache/memory-reader.cache.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/cursor/hmac-cursor.codec.ts`
- Test: `tests/regression/source-reader-service.test.ts`

**Interfaces:**
- Consumes: registry, runtime, context factory, public API, `SourceReaderError`.
- Produces: concrete `SourceReaderService implements SourceReaderApi`, ready for composition and crawler integration in the next plan.

- [ ] **Step 1: Write failing service tests for selection, fallback, unsupported capability, cache, cursor, and streaming**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPluginRegistry } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import { InProcessPluginRuntime } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts';
import { MemoryReaderCache } from '../../apps/api/src/modules/source-reader/infrastructure/cache/memory-reader.cache.ts';
import { HmacCursorCodec } from '../../apps/api/src/modules/source-reader/infrastructure/cursor/hmac-cursor.codec.ts';
import { SourceReaderService } from '../../apps/api/src/modules/source-reader/application/services/source-reader.service.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import type { SourceReaderPlugin } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';

const manifest = (id: string, priority: number) => ({
  id,
  name: id,
  version: '1.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['metadata', 'chapter-list'] as const,
  contracts: { metadata: 1, 'chapter-list': 1 },
  matchers: [{ hosts: ['example.test'], priority }],
  runtime: { preferredMode: 'in-process' as const },
  permissions: { network: { hosts: ['example.test'] } }
});

const contextFactory = {
  create: () => ({
    http: { get: async () => ({ url: '', status: 200, headers: {}, data: '' }) },
    html: { load: () => ({ text: () => '', attr: () => undefined, html: () => '', all: () => [], remove() {} }) },
    url: { normalize: (value: string) => value, resolve: (value: string, base: string) => new URL(value, base).toString() },
    cache: { get: async () => undefined, set: async () => undefined },
    logger: { info() {}, warn() {} },
    clock: { now: () => '2026-07-19T00:00:00.000Z' },
    signal: new AbortController().signal
  })
};

function createService(plugins: SourceReaderPlugin[]) {
  const registry = new InMemoryPluginRegistry();
  plugins.forEach((plugin) => registry.register(plugin));
  return new SourceReaderService(
    registry,
    new InProcessPluginRuntime(),
    contextFactory,
    new MemoryReaderCache(100),
    new HmacCursorCodec(Buffer.from('01234567890123456789012345678901'))
  );
}

test('service falls back when a higher-priority plugin reports a fallback-safe error', async () => {
  const high: SourceReaderPlugin = {
    manifest: manifest('high', 100),
    readMetadata: async () => {
      throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'bad parse', {
        retryable: false,
        fallbackAllowed: true
      });
    },
    readChapterList: async () => ({ data: { items: [], hasMore: false } })
  };
  const low: SourceReaderPlugin = {
    manifest: manifest('low', 10),
    readMetadata: async ({ url }) => ({
      data: { title: 'Fallback', sourceUrl: url, sourceName: 'Low' }
    }),
    readChapterList: async () => ({ data: { items: [], hasMore: false } })
  };
  const result = await createService([high, low]).readMetadata({ url: 'https://example.test/book' });
  assert.equal(result.data.title, 'Fallback');
  assert.equal(result.source.pluginId, 'low');
});

test('service reports unsupported capabilities without invoking another capability', async () => {
  const plugin: SourceReaderPlugin = {
    manifest: manifest('metadata-only', 1),
    readMetadata: async ({ url }) => ({ data: { title: 'Book', sourceUrl: url, sourceName: 'Demo' } }),
    readChapterList: async () => ({ data: { items: [], hasMore: false } })
  };
  await assert.rejects(
    () => createService([plugin]).readChapterContent({ url: 'https://example.test/chapter/1' }),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'CAPABILITY_NOT_SUPPORTED'
  );
});

test('chapter-list streaming yields bounded batches', async () => {
  const plugin: SourceReaderPlugin = {
    manifest: manifest('list', 1),
    readMetadata: async ({ url }) => ({ data: { title: 'Book', sourceUrl: url, sourceName: 'Demo' } }),
    readChapterList: async ({ url }) => ({
      data: {
        items: [1, 2, 3].map((index) => ({ index, title: `Chapter ${index}`, url: `${url}/${index}` })),
        hasMore: false
      }
    })
  };
  const batches = [];
  for await (const batch of createService([plugin]).streamChapterList({
    url: 'https://example.test/book',
    batchSize: 2
  })) {
    batches.push(batch.data.map((item) => item.index));
  }
  assert.deepEqual(batches, [[1, 2], [3]]);
});
```

- [ ] **Step 2: Run the service test and verify missing modules**

Run:

```bash
node --import tsx --test tests/regression/source-reader-service.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define cache and cursor ports**

```ts
// apps/api/src/modules/source-reader/application/ports/reader-cache.port.ts
export interface ReaderCacheEntry<T> {
  value: T;
  expiresAt: number;
  staleUntil?: number;
  tags: string[];
}

export interface ReaderCachePort {
  get<T>(key: string): Promise<ReaderCacheEntry<T> | undefined>;
  set<T>(key: string, entry: ReaderCacheEntry<T>): Promise<void>;
  invalidate(tags: string[]): Promise<void>;
}
```

```ts
// apps/api/src/modules/source-reader/application/ports/cursor-codec.port.ts
export interface CursorPayload {
  pluginId: string;
  pluginVersion: string;
  capability: 'chapter-list' | 'search' | 'latest-updates';
  contractVersion: number;
  requestFingerprint: string;
  offset: number;
  expiresAt: number;
}

export interface CursorCodecPort {
  encode(payload: CursorPayload): string;
  decode(token: string): CursorPayload;
}
```

- [ ] **Step 4: Implement bounded memory cache and HMAC cursor codec**

```ts
// apps/api/src/modules/source-reader/infrastructure/cache/memory-reader.cache.ts
import type {
  ReaderCacheEntry,
  ReaderCachePort
} from '../../application/ports/reader-cache.port.js';

export class MemoryReaderCache implements ReaderCachePort {
  private readonly entries = new Map<string, ReaderCacheEntry<unknown>>();

  constructor(private readonly maxEntries: number) {}

  async get<T>(key: string): Promise<ReaderCacheEntry<T> | undefined> {
    const value = this.entries.get(key);
    if (!value) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value as ReaderCacheEntry<T>;
  }

  async set<T>(key: string, entry: ReaderCacheEntry<T>): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  async invalidate(tags: string[]): Promise<void> {
    const requested = new Set(tags);
    for (const [key, entry] of this.entries) {
      if (entry.tags.some((tag) => requested.has(tag))) this.entries.delete(key);
    }
  }
}
```

```ts
// apps/api/src/modules/source-reader/infrastructure/cursor/hmac-cursor.codec.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CursorCodecPort,
  CursorPayload
} from '../../application/ports/cursor-codec.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

export class HmacCursorCodec implements CursorCodecPort {
  constructor(private readonly key: Buffer) {
    if (key.length < 32) throw new Error('Cursor key must be at least 32 bytes');
  }

  encode(payload: CursorPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.key).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  decode(token: string): CursorPayload {
    const [body, signature] = token.split('.');
    if (!body || !signature) return this.invalid();
    const expected = createHmac('sha256', this.key).update(body).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return this.invalid();
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CursorPayload;
    if (payload.expiresAt <= Date.now()) return this.invalid();
    return payload;
  }

  private invalid(): never {
    throw new SourceReaderError('CURSOR_INVALID', 'Cursor is invalid or expired', {
      retryable: false,
      fallbackAllowed: false
    });
  }
}
```

- [ ] **Step 5: Implement normalized result validation**

```ts
// apps/api/src/modules/source-reader/application/services/plugin-result-validator.ts
import { z } from 'zod';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { SourceCapability } from '../../public/source-reader.models.js';

const schemas = {
  identify: z.object({
    normalizedUrl: z.string().url(),
    domain: z.string().min(1),
    pageType: z.enum(['novel', 'chapter', 'search', 'latest', 'unknown'])
  }),
  metadata: z.object({
    title: z.string().min(2),
    sourceUrl: z.string().url(),
    sourceName: z.string().min(1),
    author: z.string().optional(),
    coverUrl: z.string().url().optional(),
    description: z.string().optional(),
    status: z.enum(['ongoing', 'completed', 'hiatus', 'cancelled', 'unknown']).optional()
  }),
  'chapter-list': z.object({
    items: z.array(
      z.object({
        index: z.number().int().positive(),
        title: z.string().min(1),
        url: z.string().url(),
        publishedAt: z.string().optional()
      })
    ),
    nextCursor: z.string().optional(),
    hasMore: z.boolean()
  }),
  'chapter-content': z.object({
    title: z.string().min(1),
    url: z.string().url(),
    rawText: z.string(),
    cleanText: z.string().min(1)
  }),
  search: z.object({ items: z.array(z.unknown()), nextCursor: z.string().optional(), hasMore: z.boolean() }),
  'latest-updates': z.object({ items: z.array(z.unknown()), nextCursor: z.string().optional(), hasMore: z.boolean() })
} as const;

export function validatePluginResult(capability: Exclude<SourceCapability, 'authentication'>, value: unknown): unknown {
  const result = schemas[capability].safeParse(value);
  if (!result.success) {
    throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'Plugin returned invalid normalized data', {
      retryable: false,
      fallbackAllowed: true,
      details: { capability, issues: result.error.issues }
    });
  }
  return result.data;
}
```

- [ ] **Step 6: Implement SourceReaderService**

```ts
// apps/api/src/modules/source-reader/application/services/source-reader.service.ts
import { createHash } from 'node:crypto';
import type { CursorCodecPort } from '../ports/cursor-codec.port.js';
import type { PluginContextFactoryPort } from '../ports/plugin-context-factory.port.js';
import type { PluginRegistryPort } from '../ports/plugin-registry.port.js';
import type { PluginRuntimePort } from '../ports/plugin-runtime.port.js';
import type { ReaderCachePort } from '../ports/reader-cache.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { PluginOperationResult } from '../../domain/plugin/source-plugin.js';
import type {
  ChapterContent,
  ChapterSummary,
  IdentifyRequest,
  LatestUpdate,
  LatestUpdatesRequest,
  NovelMetadata,
  NovelSearchResult,
  Page,
  ReadChapterContentRequest,
  ReadChapterListRequest,
  ReadMetadataRequest,
  SearchSourceRequest,
  SourceCapability,
  SourceIdentity,
  SourceReaderResult,
  StreamChapterListRequest
} from '../../public/source-reader.models.js';
import type { SourceReaderApi } from '../../public/source-reader.api.js';
import { validatePluginResult } from './plugin-result-validator.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export class SourceReaderService implements SourceReaderApi {
  constructor(
    private readonly registry: PluginRegistryPort,
    private readonly runtime: PluginRuntimePort,
    private readonly contexts: PluginContextFactoryPort,
    private readonly cache: ReaderCachePort,
    private readonly cursors: CursorCodecPort
  ) {}

  identify(request: IdentifyRequest) {
    return this.execute<SourceIdentity>('identify', request);
  }

  readMetadata(request: ReadMetadataRequest) {
    return this.execute<NovelMetadata>('metadata', request);
  }

  readChapterContent(request: ReadChapterContentRequest) {
    return this.execute<ChapterContent>('chapter-content', request);
  }

  search(request: SearchSourceRequest) {
    return this.execute<Page<NovelSearchResult>>('search', {
      ...request,
      limit: this.limit(request.limit)
    });
  }

  latestUpdates(request: LatestUpdatesRequest) {
    return this.execute<Page<LatestUpdate>>('latest-updates', {
      ...request,
      limit: this.limit(request.limit)
    });
  }

  readChapterList(request: ReadChapterListRequest) {
    return this.execute<Page<ChapterSummary>>('chapter-list', {
      ...request,
      limit: this.limit(request.limit)
    });
  }

  async *streamChapterList(request: StreamChapterListRequest) {
    const batchSize = this.limit(request.batchSize);
    let cursor: string | undefined;
    do {
      const page = await this.readChapterList({ ...request, cursor, limit: batchSize });
      for (let index = 0; index < page.data.items.length; index += batchSize) {
        yield { ...page, data: page.data.items.slice(index, index + batchSize) };
      }
      cursor = page.data.nextCursor;
    } while (cursor);
  }

  private async execute<T>(
    capability: Exclude<SourceCapability, 'authentication'>,
    request: { url: string; signal?: AbortSignal; freshOnly?: boolean; [key: string]: unknown }
  ): Promise<SourceReaderResult<T>> {
    const candidates = await this.registry.listCandidates({ url: request.url, capability });
    if (candidates.length === 0) {
      const sourceCandidates = await this.registry.listCandidates({ url: request.url, capability: 'identify' });
      throw new SourceReaderError(
        sourceCandidates.length === 0 ? 'SOURCE_NOT_SUPPORTED' : 'CAPABILITY_NOT_SUPPORTED',
        sourceCandidates.length === 0
          ? `No plugin supports ${request.url}`
          : `No plugin supports ${capability} for ${request.url}`,
        { retryable: false, fallbackAllowed: false }
      );
    }

    let lastError: unknown;
    for (const candidate of candidates) {
      const fingerprint = this.fingerprint({ capability, request, plugin: candidate.plugin.manifest });
      const cacheKey = `source-reader:${fingerprint}`;
      if (!request.freshOnly) {
        const cached = await this.cache.get<SourceReaderResult<T>>(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
      }

      const signal = request.signal ?? new AbortController().signal;
      const context = this.contexts.create({
        pluginId: candidate.plugin.manifest.id,
        allowedHosts: candidate.plugin.manifest.permissions.network.hosts,
        signal
      });
      try {
        if (candidate.plugin.canHandle) {
          const accepted = await candidate.plugin.canHandle(
            {
              url: request.url,
              normalizedUrl: candidate.normalizedUrl,
              domain: candidate.domain,
              capability
            },
            context
          );
          if (!accepted) continue;
        }
        const operation = (await this.runtime.invoke({
          registration: candidate,
          capability,
          request,
          context
        })) as PluginOperationResult<T>;
        const data = validatePluginResult(capability, operation.data) as T;
        const result: SourceReaderResult<T> = {
          data,
          source: {
            pluginId: candidate.plugin.manifest.id,
            pluginVersion: candidate.plugin.manifest.version,
            domain: candidate.domain,
            capability
          },
          extensions: operation.extensions,
          warnings: operation.warnings
        };
        const ttlMs = Math.max(0, Math.min(operation.cacheHints?.ttlMs ?? 0, 30 * 24 * 60 * 60_000));
        if (ttlMs > 0 && operation.cacheHints?.scope !== 'none') {
          await this.cache.set(cacheKey, {
            value: result,
            expiresAt: Date.now() + ttlMs,
            staleUntil: operation.cacheHints?.staleWhileRevalidateMs
              ? Date.now() + ttlMs + operation.cacheHints.staleWhileRevalidateMs
              : undefined,
            tags: [
              `plugin:${candidate.plugin.manifest.id}`,
              `domain:${candidate.domain}`,
              `capability:${capability}`,
              ...(operation.cacheHints?.tags ?? [])
            ]
          });
        }
        return result;
      } catch (error) {
        lastError = error;
        if (!(error instanceof SourceReaderError) || !error.fallbackAllowed) throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new SourceReaderError('PLUGIN_UNAVAILABLE', `No available plugin completed ${capability}`, {
      retryable: true,
      fallbackAllowed: false
    });
  }

  private limit(value: unknown): number {
    const numeric = typeof value === 'number' ? Math.floor(value) : DEFAULT_LIMIT;
    return Math.max(1, Math.min(numeric, MAX_LIMIT));
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
```

- [ ] **Step 7: Run all Source Reader core tests and typecheck**

Run:

```bash
node --import tsx --test \
  tests/regression/source-reader-public-contract.test.ts \
  tests/regression/source-reader-plugin-contract.test.ts \
  tests/regression/source-reader-plugin-registry.test.ts \
  tests/regression/source-reader-in-process-runtime.test.ts \
  tests/regression/source-reader-novelcool-plugin.test.ts \
  tests/regression/source-reader-service.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 8: Run the complete regression suite**

Run:

```bash
npm run test:regression
```

Expected: PASS; legacy source tests still pass because they have not yet been removed.

- [ ] **Step 9: Commit the complete core runtime**

```bash
git add apps/api/src/modules/source-reader/application apps/api/src/modules/source-reader/infrastructure/cache apps/api/src/modules/source-reader/infrastructure/cursor tests/regression/source-reader-service.test.ts
git commit -m "feat(source-reader): implement core reader service"
```

## Plan completion gate

Run:

```bash
npm run check:arch
npm run check -w @novel-tool/api
npm run test:regression
```

Expected: all commands exit `0`. The new Source Reader core reads NovelCool through a built-in capability plugin, while crawler remains untouched until the next plan.
