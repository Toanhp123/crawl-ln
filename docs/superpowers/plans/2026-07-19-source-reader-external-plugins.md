# Source Reader External Plugin Implementation Plan

> **Superseded runtime note:** Tasks 1, 2, 4, and 5 remain historical implementation records. Task 3's `worker_threads` design was replaced by `2026-07-20-source-reader-security-remediation.md`; the current runtime is a supervised child-process sandbox with constrained loading and bounded schema-validated RPC. Do not implement the worker-thread snippets below.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install, verify, approve, isolate, activate, monitor, and quarantine external `.source-plugin` packages while preserving the same logical plugin contract used by built-in plugins.

**Architecture:** Treat package bytes as untrusted until archive, path, checksum, signature, manifest, contract, and permission checks pass. Persist installation and permission state and activate versions atomically. The worker-thread runtime described by the original Task 3 is superseded by the security-remediation process sandbox.

**Tech Stack:** TypeScript 5.5, Node.js 22, `node:crypto`, JSZip 3, Zod 3, SQLite, Node test runner. Current sandbox details are defined in the superseding security-remediation plan.

## Global Constraints

- Package extension is `.source-plugin`; development directories are allowed only through an explicit development loader.
- Package structure is `manifest.json`, `dist/index.js`, optional `schemas/`, optional `assets/`, `checksums.json`, and optional `signature.json`.
- No plugin code runs before verification and permission approval.
- `local-unverified` plugins always run isolated.
- Invalid checksum/signature, path traversal, symlink escape, API incompatibility, or malformed manifest moves installation to quarantine.
- Permission expansion on upgrade requires a new approval.
- External plugin sandboxes receive no database handle, master key, unrestricted filesystem, unrestricted network, `process.env`, subprocess creation, worker creation, or raw browser profile.
- Activation is atomic: the previous active version remains usable until the new version passes initialization and health checks.

---

### Task 1: Define package verification and trust contracts

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/plugin-package-verifier.port.ts`
- Create: `apps/api/src/modules/source-reader/application/ports/trust-store.port.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts`
- Modify: `apps/api/src/shared/config/env.ts`
- Test: `tests/regression/source-plugin-package-security.test.ts`

**Interfaces:**
- Consumes: raw package bytes and configured public signing keys.
- Produces: `VerifiedPluginPackage` containing verified files, parsed manifest, checksum, signature status, and trust level; never executes code.

- [ ] **Step 1: Write failing archive traversal, checksum, and unsigned-package tests**

```ts
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import test from 'node:test';
import { SourcePluginPackageVerifier } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts';
import { StaticTrustStore } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts';

async function packageBytes(input: {
  entryName?: string;
  entrySource?: string;
  checksum?: string;
}) {
  const zip = new JSZip();
  const entryName = input.entryName ?? 'dist/index.js';
  const entrySource = input.entrySource ?? 'export default () => ({})';
  zip.file(
    'manifest.json',
    JSON.stringify({
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      engines: { sourceReader: '>=1.0.0 <2.0.0' },
      capabilities: ['metadata'],
      contracts: { metadata: 1 },
      matchers: [{ hosts: ['example.test'], priority: 10 }],
      runtime: { preferredMode: 'isolated' },
      permissions: { network: { hosts: ['example.test'] } }
    })
  );
  zip.file(entryName, entrySource);
  zip.file(
    'checksums.json',
    JSON.stringify({
      [entryName]: input.checksum ?? 'will-be-replaced-by-fixture-helper'
    })
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('verifier rejects archive traversal before extraction', async () => {
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));
  await assert.rejects(() => verifier.verify(await packageBytes({ entryName: '../escape.js' })), /path/i);
});

test('unsigned package is local-unverified rather than trusted', async () => {
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));
  const bytes = await createValidUnsignedFixture();
  const verified = await verifier.verify(bytes);
  assert.equal(verified.signatureStatus, 'unsigned');
  assert.equal(verified.trustLevel, 'local-unverified');
  assert.equal(verified.executionMode, 'isolated');
});
```

- [ ] **Step 2: Run the test and verify missing verifier modules**

Run:

```bash
node --import tsx --test tests/regression/source-plugin-package-security.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define verifier and trust-store ports**

```ts
// apps/api/src/modules/source-reader/application/ports/plugin-package-verifier.port.ts
import type {
  PluginExecutionMode,
  PluginTrustLevel,
  SourcePluginManifest
} from '../../domain/plugin/source-plugin.js';

export interface VerifiedPluginPackage {
  manifest: SourcePluginManifest;
  files: Map<string, Uint8Array>;
  packageChecksum: string;
  signatureStatus: 'valid' | 'unsigned';
  trustLevel: PluginTrustLevel;
  executionMode: PluginExecutionMode;
  signerKeyId?: string;
}

export interface PluginPackageVerifierPort {
  verify(bytes: Uint8Array): Promise<VerifiedPluginPackage>;
}
```

```ts
// apps/api/src/modules/source-reader/application/ports/trust-store.port.ts
export interface TrustedSigningKey {
  id: string;
  algorithm: 'ed25519';
  publicKeyPem: string;
}

export interface TrustStorePort {
  find(keyId: string): Promise<TrustedSigningKey | undefined>;
}
```

- [ ] **Step 4: Implement static trust store and environment key parsing**

```ts
// apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts
import type {
  TrustedSigningKey,
  TrustStorePort
} from '../../../application/ports/trust-store.port.js';

export class StaticTrustStore implements TrustStorePort {
  private readonly byId: Map<string, TrustedSigningKey>;
  constructor(keys: TrustedSigningKey[]) {
    this.byId = new Map(keys.map((key) => [key.id, key]));
  }
  async find(keyId: string) {
    return this.byId.get(keyId);
  }
}
```

```ts
// Add to apps/api/src/shared/config/env.ts
function jsonEnv<T>(name: string, fallback: T): T {
  const value = process.env[name];
  return value ? (JSON.parse(value) as T) : fallback;
}

sourceReaderTrustedKeys: jsonEnv<
  Array<{ id: string; algorithm: 'ed25519'; publicKeyPem: string }>
>('SOURCE_READER_TRUSTED_KEYS_JSON', [])
```

- [ ] **Step 5: Implement package verification without extraction**

```ts
// apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts
import { createHash, verify as verifySignature } from 'node:crypto';
import JSZip from 'jszip';
import type {
  PluginPackageVerifierPort,
  VerifiedPluginPackage
} from '../../../application/ports/plugin-package-verifier.port.js';
import type { TrustStorePort } from '../../../application/ports/trust-store.port.js';
import { parseSourcePluginManifest } from '../../../domain/plugin/source-plugin-manifest.schema.js';

const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 500;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const requiredFiles = ['manifest.json', 'dist/index.js', 'checksums.json'];

function safePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').some((segment) => segment === '..' || segment === '')
  );
}

export class SourcePluginPackageVerifier implements PluginPackageVerifierPort {
  constructor(private readonly trustStore: TrustStorePort) {}

  async verify(bytes: Uint8Array): Promise<VerifiedPluginPackage> {
    if (bytes.byteLength > MAX_PACKAGE_BYTES) throw new Error('Plugin package exceeds size limit');
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    if (entries.length > MAX_FILES) throw new Error('Plugin package contains too many files');
    for (const entry of entries) if (!safePath(entry.name)) throw new Error(`Unsafe package path: ${entry.name}`);
    for (const file of requiredFiles) if (!zip.file(file)) throw new Error(`Missing ${file}`);

    const files = new Map<string, Uint8Array>();
    let uncompressed = 0;
    for (const entry of entries) {
      const content = await entry.async('uint8array');
      uncompressed += content.byteLength;
      if (uncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error('Plugin package expands beyond limit');
      files.set(entry.name, content);
    }

    const manifest = parseSourcePluginManifest(
      JSON.parse(Buffer.from(files.get('manifest.json')!).toString('utf8'))
    );
    const checksums = JSON.parse(
      Buffer.from(files.get('checksums.json')!).toString('utf8')
    ) as Record<string, string>;
    for (const [path, expected] of Object.entries(checksums)) {
      const content = files.get(path);
      if (!content) throw new Error(`Checksum references missing file ${path}`);
      const actual = createHash('sha256').update(content).digest('hex');
      if (actual !== expected) throw new Error(`Checksum mismatch for ${path}`);
    }

    const packageChecksum = createHash('sha256').update(bytes).digest('hex');
    const signatureBytes = files.get('signature.json');
    if (!signatureBytes) {
      return {
        manifest,
        files,
        packageChecksum,
        signatureStatus: 'unsigned',
        trustLevel: 'local-unverified',
        executionMode: 'isolated'
      };
    }

    const signature = JSON.parse(Buffer.from(signatureBytes).toString('utf8')) as {
      keyId: string;
      algorithm: 'ed25519';
      signature: string;
    };
    const key = await this.trustStore.find(signature.keyId);
    if (!key) throw new Error(`Untrusted signing key ${signature.keyId}`);
    const signedPayload = Buffer.from(JSON.stringify({ manifest, checksums }));
    const valid = verifySignature(
      null,
      signedPayload,
      key.publicKeyPem,
      Buffer.from(signature.signature, 'base64')
    );
    if (!valid) throw new Error('Plugin signature is invalid');
    return {
      manifest,
      files,
      packageChecksum,
      signatureStatus: 'valid',
      trustLevel: 'signed',
      executionMode: manifest.runtime.preferredMode
    };
  }
}
```

- [ ] **Step 6: Complete deterministic fixture helpers and run security tests**

The helper must compute SHA-256 for every file listed in `checksums.json`; do not use a fixed placeholder digest.

Run:

```bash
node --import tsx --test tests/regression/source-plugin-package-security.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit package verification**

```bash
git add apps/api/src/modules/source-reader/application/ports/plugin-package-verifier.port.ts apps/api/src/modules/source-reader/application/ports/trust-store.port.ts apps/api/src/modules/source-reader/infrastructure/plugins/package-loader apps/api/src/shared/config/env.ts tests/regression/source-plugin-package-security.test.ts
git commit -m "feat(source-reader): verify external plugin packages"
```

---

### Task 2: Persist installation, versions, permissions, and atomic activation

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts`
- Create: `apps/api/src/modules/source-reader/application/services/plugin-installation.service.ts`
- Modify: `apps/api/src/shared/config/env.ts`
- Test: `tests/integration/source-plugin-installation.test.ts`

**Interfaces:**
- Consumes: verified package, SQLite database, storage paths, clock and ID generator.
- Produces: installation records, permission diffs, pending approval state, version storage, active-version swap, and quarantine.

- [ ] **Step 1: Write failing installation tests**

```ts
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';
import { SqlitePluginStore } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts';

const root = await mkdtemp(join(tmpdir(), 'source-plugin-install-'));
const database = createSqliteDatabase(join(root, 'test.sqlite'));
const store = new SqlitePluginStore(database);

test.after(() => {
  database.close();
  return rm(root, { recursive: true, force: true });
});

test('unsigned installation remains pending approval and cannot become active', async () => {
  await store.recordInstallation({
    id: 'install-1',
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    originalPackagePath: '/tmp/demo.source-plugin',
    status: 'pending-approval',
    createdAt: '2026-07-19T00:00:00.000Z'
  });
  await store.upsertPluginVersion({
    pluginId: 'demo',
    name: 'Demo',
    version: '1.0.0',
    trustLevel: 'local-unverified',
    status: 'pending-approval',
    packagePath: '/store/demo/1.0.0',
    checksum: 'abc',
    signatureStatus: 'unsigned',
    manifestJson: '{}',
    sdkRange: '>=1 <2',
    installedAt: '2026-07-19T00:00:00.000Z'
  });
  await assert.rejects(() => store.activate('demo', '1.0.0', '2026-07-19T00:01:00.000Z'));
});
```

- [ ] **Step 2: Define the plugin store port**

```ts
// apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts
import type {
  PluginStatus,
  PluginTrustLevel,
  SourcePluginManifest
} from '../../domain/plugin/source-plugin.js';

export interface StoredPluginVersion {
  pluginId: string;
  version: string;
  trustLevel: PluginTrustLevel;
  status: PluginStatus;
  packagePath: string;
  checksum: string;
  signatureStatus: 'built-in' | 'valid' | 'unsigned' | 'invalid';
  manifest: SourcePluginManifest;
}

export interface PluginStorePort {
  recordInstallation(input: {
    id: string;
    pluginId?: string;
    pluginVersion?: string;
    originalPackagePath: string;
    stagingPath?: string;
    status: string;
    errorCode?: string;
    createdAt: string;
    completedAt?: string;
  }): Promise<void>;
  upsertPluginVersion(input: {
    pluginId: string;
    name: string;
    version: string;
    trustLevel: PluginTrustLevel;
    status: PluginStatus;
    packagePath: string;
    checksum: string;
    signatureStatus: 'built-in' | 'valid' | 'unsigned' | 'invalid';
    manifestJson: string;
    sdkRange: string;
    installedAt: string;
  }): Promise<void>;
  replaceRequestedPermissions(input: {
    pluginId: string;
    pluginVersion: string;
    permissions: Array<{ permission: string; scopeJson: string }>;
  }): Promise<void>;
  approvePermissions(input: {
    pluginId: string;
    pluginVersion: string;
    approvedBy: string;
    approvedAt: string;
  }): Promise<void>;
  permissionsApproved(pluginId: string, version: string): Promise<boolean>;
  activate(pluginId: string, version: string, activatedAt: string): Promise<void>;
  findActive(pluginId: string): Promise<StoredPluginVersion | undefined>;
  quarantine(pluginId: string, version: string, reason: string): Promise<void>;
}
```

- [ ] **Step 3: Implement transactional SQLite store**

```ts
// apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts
// Implement every PluginStorePort method using database.transaction().
// `activate()` must:
// 1. verify plugin version exists;
// 2. verify all requested permissions are approved;
// 3. update source_reader_plugins.active_version and status='active';
// 4. set source_reader_plugin_versions.activated_at;
// 5. leave the previous active version unchanged if any statement fails.
```

The activation guard must be explicit:

```ts
const approved = this.database.connection
  .prepare(`SELECT COUNT(*) AS pending
            FROM source_reader_plugin_permissions
            WHERE plugin_id=? AND plugin_version=? AND status!='approved'`)
  .get(pluginId, version) as { pending: number };
if (approved.pending > 0) throw new Error('Plugin permissions are not approved');
```

- [ ] **Step 4: Implement installation service and safe filesystem layout**

```ts
// apps/api/src/modules/source-reader/application/services/plugin-installation.service.ts
export class PluginInstallationService {
  constructor(
    private readonly verifier: PluginPackageVerifierPort,
    private readonly store: PluginStorePort,
    private readonly pluginRoot: string,
    private readonly ids: { next(): string },
    private readonly clock: { now(): Date }
  ) {}

  async install(input: { bytes: Uint8Array; originalName: string }) {
    const installationId = this.ids.next();
    const createdAt = this.clock.now().toISOString();
    const packagePath = join(this.pluginRoot, 'packages', `${installationId}.source-plugin`);
    await mkdir(dirname(packagePath), { recursive: true });
    await writeFile(packagePath, input.bytes, { flag: 'wx' });
    try {
      const verified = await this.verifier.verify(input.bytes);
      const versionRoot = join(
        this.pluginRoot,
        'installed',
        verified.manifest.id,
        verified.manifest.version
      );
      const staging = `${versionRoot}.staging-${installationId}`;
      await mkdir(staging, { recursive: true });
      for (const [path, content] of verified.files) {
        const target = join(staging, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, { flag: 'wx' });
      }
      await rename(staging, versionRoot);
      const status = 'pending-approval';
      await this.store.upsertPluginVersion({
        pluginId: verified.manifest.id,
        name: verified.manifest.name,
        version: verified.manifest.version,
        trustLevel: verified.trustLevel,
        status,
        packagePath: versionRoot,
        checksum: verified.packageChecksum,
        signatureStatus: verified.signatureStatus,
        manifestJson: JSON.stringify(verified.manifest),
        sdkRange: verified.manifest.engines.sourceReader,
        installedAt: createdAt
      });
      await this.store.replaceRequestedPermissions({
        pluginId: verified.manifest.id,
        pluginVersion: verified.manifest.version,
        permissions: permissionRows(verified.manifest.permissions)
      });
      return { installationId, pluginId: verified.manifest.id, version: verified.manifest.version, status };
    } catch (error) {
      await this.store.recordInstallation({
        id: installationId,
        originalPackagePath: packagePath,
        status: 'quarantined',
        errorCode: error instanceof Error ? error.name : 'INSTALL_FAILED',
        createdAt,
        completedAt: this.clock.now().toISOString()
      });
      throw error;
    }
  }
}
```

- [ ] **Step 5: Add storage configuration**

```ts
// apps/api/src/shared/config/env.ts
sourceReaderPluginDir:
  process.env.SOURCE_READER_PLUGIN_DIR ?? resolve(process.env.STORAGE_DIR ?? './storage', 'source-plugins')
```

- [ ] **Step 6: Run installation and transaction tests**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test \
  tests/integration/source-plugin-installation.test.ts \
  tests/integration/sqlite-transaction.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit installation persistence**

```bash
git add apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts apps/api/src/modules/source-reader/application/services/plugin-installation.service.ts apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts apps/api/src/shared/config/env.ts tests/integration/source-plugin-installation.test.ts
git commit -m "feat(source-reader): persist plugin installation lifecycle"
```

---

### Task 3: Build isolated worker RPC runtime — superseded, do not execute

**Files:**
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker/worker-protocol.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker/plugin-worker.entry.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker/isolated-worker-plugin.runtime.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/runtime/runtime-router.ts`
- Modify: `apps/api/src/modules/source-reader/application/ports/plugin-runtime.port.ts`
- Test: `tests/regression/source-reader-isolated-worker.test.ts`
- Test fixture: `tests/fixtures/source-reader/external-plugins/worker-demo/dist/index.js`

**Interfaces:**
- Consumes: installed plugin path, serialized request, execution timeout, allowed context operations.
- Produces: `IsolatedWorkerPluginRuntime` and `RuntimeRouter` selecting in-process or isolated execution by registration.

- [ ] **Step 1: Write failing worker success, timeout, crash, and environment-isolation tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { IsolatedWorkerPluginRuntime } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker/isolated-worker-plugin.runtime.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

test('isolated worker invokes plugin without exposing process.env', async () => {
  process.env.WORKER_SECRET_SENTINEL = 'must-not-leak';
  const runtime = new IsolatedWorkerPluginRuntime({ defaultTimeoutMs: 2_000 });
  const result = await runtime.invokeExternal({
    pluginPath: 'tests/fixtures/source-reader/external-plugins/worker-demo/dist/index.js',
    manifest: workerDemoManifest,
    capability: 'metadata',
    request: { url: 'https://example.test/book' },
    context: contextFixture()
  });
  assert.equal((result.data as { title: string }).title, 'Worker Demo');
  assert.equal((result.extensions?.['demo/env']?.data as { leaked: boolean }).leaked, false);
});

test('hung worker is terminated and mapped to plugin runtime error', async () => {
  const runtime = new IsolatedWorkerPluginRuntime({ defaultTimeoutMs: 20 });
  await assert.rejects(
    () => runtime.invokeExternal(hangingInvocationFixture()),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_UNAVAILABLE'
  );
});
```

- [ ] **Step 2: Define serializable worker protocol**

```ts
// worker-protocol.ts
export type WorkerRequest =
  | {
      type: 'invoke';
      invocationId: string;
      pluginPath: string;
      capability: string;
      request: Record<string, unknown>;
      context: {
        now: string;
        normalizedUrl: string;
      };
    }
  | {
      type: 'context-result';
      invocationId: string;
      callId: string;
      ok: boolean;
      value?: unknown;
      error?: { code: string; message: string };
    };

export type WorkerResponse =
  | {
      type: 'result';
      invocationId: string;
      ok: true;
      value: unknown;
    }
  | {
      type: 'result';
      invocationId: string;
      ok: false;
      error: { name: string; message: string; code?: string };
    }
  | {
      type: 'context-call';
      invocationId: string;
      callId: string;
      service: 'http' | 'html' | 'url' | 'cache' | 'logger';
      method: string;
      args: unknown[];
    };
```

- [ ] **Step 3: Implement worker entry with a frozen minimal global surface**

```ts
// plugin-worker.entry.ts
import { parentPort } from 'node:worker_threads';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

if (!parentPort) throw new Error('Plugin worker requires parentPort');

for (const key of Object.keys(process.env)) delete process.env[key];
Object.freeze(process.env);

globalThis.fetch = undefined as never;

parentPort.on('message', async (message: WorkerRequest) => {
  if (message.type !== 'invoke') return;
  try {
    const module = (await import(new URL(`file://${message.pluginPath}`).href)) as {
      default: (context: unknown) => Promise<Record<string, Function>> | Record<string, Function>;
    };
    const context = createRpcContext(message.invocationId, parentPort);
    const plugin = await module.default(context);
    const method = methodForCapability(message.capability);
    if (typeof plugin[method] !== 'function') throw new Error(`Missing ${method}`);
    const value = await plugin[method](message.request, context);
    parentPort!.postMessage({ type: 'result', invocationId: message.invocationId, ok: true, value } satisfies WorkerResponse);
  } catch (error) {
    parentPort!.postMessage({
      type: 'result',
      invocationId: message.invocationId,
      ok: false,
      error: { name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : String(error) }
    } satisfies WorkerResponse);
  }
});
```

Implement the RPC context in the same file using serializable call messages only:

```ts
function createRpcContext(invocationId: string, port: NonNullable<typeof parentPort>) {
  let sequence = 0;
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  port.on('message', (message: WorkerResponse) => {
    if (message.type !== 'context-result' || message.invocationId !== invocationId) return;
    const deferred = pending.get(message.callId);
    if (!deferred) return;
    pending.delete(message.callId);
    message.ok ? deferred.resolve(message.value) : deferred.reject(new Error(message.error.message));
  });
  const call = (service: 'http' | 'html' | 'url' | 'cache' | 'logger', method: string, args: unknown[]) => {
    const callId = `${invocationId}:${++sequence}`;
    return new Promise<unknown>((resolve, reject) => {
      pending.set(callId, { resolve, reject });
      port.postMessage({ type: 'context-call', invocationId, callId, service, method, args } satisfies WorkerResponse);
    });
  };
  return Object.freeze({
    http: Object.freeze({ get: (url: string, options?: unknown) => call('http', 'get', [url, options]) }),
    html: Object.freeze({ text: (html: string, selector: string) => call('html', 'text', [html, selector]) }),
    url: Object.freeze({ resolve: (base: string, href: string) => call('url', 'resolve', [base, href]) }),
    cache: Object.freeze({ get: (key: string) => call('cache', 'get', [key]), set: (key: string, value: unknown) => call('cache', 'set', [key, value]) }),
    logger: Object.freeze({ info: (message: string, fields?: unknown) => call('logger', 'info', [message, fields]) })
  });
}
```

Add `context-result` to `WorkerResponse`; no JavaScript function is sent through `postMessage`.

- [ ] **Step 4: Implement host runtime with timeout and context-call dispatch**

```ts
// isolated-worker-plugin.runtime.ts
export class IsolatedWorkerPluginRuntime {
  constructor(private readonly options: { defaultTimeoutMs: number }) {}

  async invokeExternal(input: ExternalPluginInvocation) {
    const worker = new Worker(
      new URL('./plugin-worker.entry.js', import.meta.url),
      {
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 32,
          stackSizeMb: 4
        }
      }
    );
    const invocationId = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        void worker.terminate();
        reject(
          new SourceReaderError('PLUGIN_UNAVAILABLE', 'Plugin worker timed out', {
            retryable: true,
            fallbackAllowed: true
          })
        );
      }, input.timeoutMs ?? this.options.defaultTimeoutMs);

      worker.on('message', async (message: WorkerResponse) => {
        if (message.type === 'context-call') {
          await dispatchContextCall(worker, message, input.context);
          return;
        }
        if (message.type !== 'result' || message.invocationId !== invocationId) return;
        clearTimeout(timeout);
        await worker.terminate();
        if (message.ok) resolve(message.value);
        else
          reject(
            new SourceReaderError('PLUGIN_UNAVAILABLE', message.error.message, {
              retryable: true,
              fallbackAllowed: true
            })
          );
      });
      worker.once('error', (error) => {
        clearTimeout(timeout);
        reject(
          new SourceReaderError('PLUGIN_UNAVAILABLE', 'Plugin worker crashed', {
            retryable: true,
            fallbackAllowed: true,
            cause: error
          })
        );
      });
      worker.postMessage({
        type: 'invoke',
        invocationId,
        pluginPath: input.pluginPath,
        capability: input.capability,
        request: input.request,
        context: { now: input.context.clock.now(), normalizedUrl: input.request.url as string }
      } satisfies WorkerRequest);
    });
  }
}
```

- [ ] **Step 5: Add runtime router**

```ts
// runtime-router.ts
export class RuntimeRouter implements PluginRuntimePort {
  constructor(
    private readonly inProcess: InProcessPluginRuntime,
    private readonly isolated: IsolatedWorkerPluginRuntime
  ) {}

  invoke(invocation: PluginInvocation) {
    if (
      invocation.registration.trustLevel === 'local-unverified' ||
      invocation.registration.executionMode === 'isolated'
    ) {
      if (!invocation.registration.packagePath) {
        throw new SourceReaderError('PLUGIN_UNAVAILABLE', 'External plugin path is missing', {
          retryable: false,
          fallbackAllowed: true
        });
      }
      return this.isolated.invokeExternal({
        pluginPath: join(invocation.registration.packagePath, 'dist/index.js'),
        manifest: invocation.registration.plugin.manifest,
        capability: invocation.capability,
        request: invocation.request,
        context: invocation.context
      });
    }
    return this.inProcess.invoke(invocation);
  }
}
```

Modify `apps/api/src/modules/source-reader/domain/plugin/registered-plugin.ts` so `RegisteredPlugin` includes `packagePath?: string`; set it only for verified external installations and leave it undefined for built-in plugins.

- [ ] **Step 6: Run worker runtime tests and typecheck**

Run:

```bash
node --import tsx --test tests/regression/source-reader-isolated-worker.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit isolated runtime**

```bash
git add apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker apps/api/src/modules/source-reader/infrastructure/runtime/runtime-router.ts apps/api/src/modules/source-reader/application/ports/plugin-runtime.port.ts apps/api/src/modules/source-reader/application/ports/plugin-registry.port.ts tests/regression/source-reader-isolated-worker.test.ts tests/fixtures/source-reader/external-plugins
git commit -m "feat(source-reader): isolate external plugin execution"
```

---

### Task 4: Load approved installed plugins into the registry

**Files:**
- Create: `apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Test: `tests/integration/source-plugin-activation.test.ts`

**Interfaces:**
- Consumes: approved active plugin versions from `PluginStorePort` and isolated runtime package paths.
- Produces: registry registrations that can coexist by domain/capability with built-in plugins.

- [ ] **Step 1: Write failing activation and per-capability composition test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

test('approved external plugin can override one capability without replacing built-in metadata', async () => {
  const runtime = await createSourceReaderFixtureWithInstalledPlugin({
    pluginId: 'novelcool-content-override',
    capability: 'chapter-content',
    priority: 200,
    host: 'novelcool.com'
  });
  const metadataCandidates = await runtime.registry.listCandidates({
    url: 'https://novelcool.com/novel/book',
    capability: 'metadata'
  });
  assert.equal(metadataCandidates[0].plugin.manifest.id, 'novelcool');
  const contentCandidates = await runtime.registry.listCandidates({
    url: 'https://novelcool.com/chapter/1',
    capability: 'chapter-content'
  });
  assert.equal(contentCandidates[0].plugin.manifest.id, 'novelcool-content-override');
});
```

- [ ] **Step 2: Implement external descriptor loader**

```ts
// external-plugin.loader.ts
export class ExternalPluginLoader {
  constructor(private readonly store: PluginStorePort) {}

  async loadActive(): Promise<RegisteredPlugin[]> {
    const versions = await this.store.listActive();
    return versions.map((version) => ({
      plugin: {
        manifest: version.manifest
      },
      trustLevel: version.trustLevel,
      executionMode:
        version.trustLevel === 'local-unverified'
          ? 'isolated'
          : version.manifest.runtime.preferredMode,
      enabled: true,
      packagePath: version.packagePath
    }));
  }
}
```

Extend `PluginStorePort` and `SqlitePluginStore` with:

```ts
listActive(): Promise<StoredPluginVersion[]>;
```

- [ ] **Step 3: Add atomic registry replacement**

```ts
// InMemoryPluginRegistry
replaceExternal(registrations: RegisteredPlugin[]): void {
  for (const [id, value] of this.registrations) {
    if (value.trustLevel !== 'built-in') this.registrations.delete(id);
  }
  for (const registration of registrations) {
    this.register(registration.plugin, registration);
  }
}
```

- [ ] **Step 4: Load active external plugins at Source Reader lifecycle start**

```ts
const externalLoader = new ExternalPluginLoader(pluginStore);

lifecycle: {
  async start() {
    registry.replaceExternal(await externalLoader.loadActive());
    maintenance.start();
  },
  async stop() {
    await maintenance.stop();
  }
}
```

- [ ] **Step 5: Run activation, registry, and Source Reader service tests**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-plugin-activation.test.ts
node --import tsx --test \
  tests/regression/source-reader-plugin-registry.test.ts \
  tests/regression/source-reader-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit active plugin loading**

```bash
git add apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.ts apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts apps/api/src/shared/container/modules/source-reader.module.ts tests/integration/source-plugin-activation.test.ts
git commit -m "feat(source-reader): activate approved external plugins"
```

---

### Task 5: Add health checks, failure state, circuit eligibility, and quarantine

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/plugin-health.repository.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin-health.repository.ts`
- Create: `apps/api/src/modules/source-reader/application/services/plugin-health.service.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Test: `tests/integration/source-plugin-health.test.ts`

**Interfaces:**
- Consumes: registry candidates, runtime, plugin store, health repository.
- Produces: capability-level degraded state, startup health gate, quarantine after integrity failure, and eligibility recovery.

- [ ] **Step 1: Write failing health behavior test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

test('repeated chapter-content failures degrade only that capability', async () => {
  const fixture = await createHealthFixture();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await fixture.health.recordFailure({
      pluginId: 'demo',
      pluginVersion: '1.0.0',
      capability: 'chapter-content',
      failureCode: 'PLUGIN_RESULT_INVALID',
      durationMs: 10
    });
  }
  assert.equal(
    await fixture.health.isEligible('demo', 'chapter-content'),
    false
  );
  assert.equal(await fixture.health.isEligible('demo', 'metadata'), true);
});
```

- [ ] **Step 2: Define and implement health repository**

```ts
export interface PluginHealthRepository {
  record(input: {
    id: string;
    pluginId: string;
    pluginVersion: string;
    capability?: SourceCapability;
    status: 'healthy' | 'failed';
    durationMs: number;
    failureCode?: string;
    checkedAt: string;
  }): Promise<void>;
  recentFailures(input: {
    pluginId: string;
    pluginVersion: string;
    capability: SourceCapability;
    since: string;
  }): Promise<number>;
}
```

Implement with `source_reader_health_checks` and an indexed query by plugin/capability/time.

- [ ] **Step 3: Implement health service eligibility**

```ts
export class PluginHealthService {
  constructor(
    private readonly repository: PluginHealthRepository,
    private readonly clock: { now(): Date },
    private readonly threshold = 5,
    private readonly windowMs = 60_000
  ) {}

  async isEligible(pluginId: string, pluginVersion: string, capability: SourceCapability) {
    const since = new Date(this.clock.now().getTime() - this.windowMs).toISOString();
    return (
      (await this.repository.recentFailures({ pluginId, pluginVersion, capability, since })) <
      this.threshold
    );
  }
}
```

- [ ] **Step 4: Filter candidates and record invocation outcomes**

```ts
// In SourceReaderService candidate loop:
if (!(await this.health.isEligible(
  candidate.plugin.manifest.id,
  candidate.plugin.manifest.version,
  capability
))) continue;

const started = performance.now();
try {
  // invoke and validate
  await this.health.recordSuccess(...);
} catch (error) {
  await this.health.recordFailure(...);
  // existing fallback policy
}
```

- [ ] **Step 5: Quarantine integrity failures and keep runtime failures degraded**

```ts
// Package checksum/signature/path failures:
await pluginStore.quarantine(pluginId, version, failureCode);
registry.unregister(pluginId);

// Parser/network/runtime failures:
// record health only; do not quarantine package bytes.
```

- [ ] **Step 6: Run health, fallback, installation, and integration suites**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test \
  tests/integration/source-plugin-health.test.ts \
  tests/integration/source-plugin-installation.test.ts \
  tests/integration/source-plugin-activation.test.ts
node --import tsx --test tests/regression/source-reader-service.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit plugin supervision**

```bash
git add apps/api/src/modules/source-reader/application/ports/plugin-health.repository.ts apps/api/src/modules/source-reader/application/services/plugin-health.service.ts apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin-health.repository.ts apps/api/src/modules/source-reader/application/services/source-reader.service.ts apps/api/src/shared/container/modules/source-reader.module.ts tests/integration/source-plugin-health.test.ts
git commit -m "feat(source-reader): supervise external plugin health"
```

## Plan completion gate

Run:

```bash
npm run verify
```

Expected: exit `0`. Invalid packages never execute, unsigned packages require approval and always run isolated, capability-level failures permit fallback, and activation leaves the previous healthy version available until replacement succeeds.
