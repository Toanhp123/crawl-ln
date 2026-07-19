# Source Reader State and Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Source Reader-owned SQLite state, encrypted secret storage, credential/network/session/challenge repositories, runtime-context resolution, and persistent scope-aware caching.

**Architecture:** Extend the existing migration pipeline with module-owned tables, hide them behind Source Reader ports, encrypt every sensitive payload with an AEAD `SecretVault`, resolve user/system runtime profiles without exposing plaintext secrets to plugins, and layer persistent cache beneath memory cache.

**Tech Stack:** Node.js 22 `node:sqlite`, `node:crypto` AES-256-GCM, TypeScript 5.5, Node test runner, existing `SqliteDatabase`, Zod.

## Global Constraints

- Source Reader tables use the `source_reader_` prefix and are accessed only by Source Reader repositories.
- Database remains the existing application SQLite database.
- Credentials, cookies, tokens, proxy passwords, and VPN configuration are encrypted before persistence.
- Missing or invalid master key yields degraded secret-dependent behavior; it never creates a replacement key or stores plaintext.
- Cache scope is exactly `public`, `account`, `user`, `session`, or `none`.
- A module may narrow a plugin cache hint but never widen it.
- Runtime resolution order is explicit user request, user default, system default, plugin requirement, then direct/anonymous only when permitted.
- Source Reader still does not persist novels, chapters, or crawl tasks.

---

### Task 1: Add Source Reader database migrations and ownership regression

**Files:**
- Modify: `apps/api/src/shared/database/sqlite.ts`
- Create: `tests/integration/source-reader-schema.test.ts`
- Create: `tests/regression/source-reader-persistence-boundary.test.ts`

**Interfaces:**
- Consumes: existing migration versions through `14`.
- Produces: migration versions `15`, `16`, and `17` containing plugin, security, session, challenge, cache, installation, and health tables.

- [ ] **Step 1: Write the failing schema integration test**

```ts
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';

const root = await mkdtemp(join(tmpdir(), 'source-reader-schema-'));
const database = createSqliteDatabase(join(root, 'test.sqlite'));

test.after(() => {
  database.close();
  return rm(root, { recursive: true, force: true });
});

test('source reader owns required tables and indexes', () => {
  const tables = database.connection
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'source_reader_%'")
    .all()
    .map((row) => (row as { name: string }).name)
    .sort();
  assert.deepEqual(tables, [
    'source_reader_auth_challenges',
    'source_reader_cache_entries',
    'source_reader_credentials',
    'source_reader_health_checks',
    'source_reader_installations',
    'source_reader_network_profiles',
    'source_reader_plugin_permissions',
    'source_reader_plugin_versions',
    'source_reader_plugins',
    'source_reader_sessions'
  ]);
});
```

- [ ] **Step 2: Write the failing ownership regression test**

```ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

test('only source reader infrastructure queries source_reader tables', () => {
  for (const file of files('apps/api/src')) {
    const source = readFileSync(file, 'utf8');
    if (!/source_reader_/.test(source)) continue;
    assert.match(
      file.replaceAll('\\', '/'),
      /modules\/source-reader\/infrastructure\/sqlite\/|shared\/database\/sqlite\.ts$/,
      file
    );
  }
});
```

- [ ] **Step 3: Run both tests and verify missing tables**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test \
  tests/integration/source-reader-schema.test.ts \
  tests/regression/source-reader-persistence-boundary.test.ts
```

Expected: schema test FAIL because no `source_reader_*` tables exist.

- [ ] **Step 4: Add migration 15 for plugins and permissions**

```ts
{
  version: 15,
  up(db) {
    db.exec(`
      CREATE TABLE source_reader_plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trust_level TEXT NOT NULL,
        status TEXT NOT NULL,
        active_version TEXT,
        enabled INTEGER NOT NULL DEFAULT 0,
        installed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE source_reader_plugin_versions (
        plugin_id TEXT NOT NULL,
        version TEXT NOT NULL,
        package_path TEXT,
        checksum TEXT NOT NULL,
        signature_status TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        sdk_range TEXT NOT NULL,
        installed_at TEXT NOT NULL,
        activated_at TEXT,
        PRIMARY KEY(plugin_id, version),
        FOREIGN KEY(plugin_id) REFERENCES source_reader_plugins(id) ON DELETE CASCADE
      );
      CREATE TABLE source_reader_plugin_permissions (
        plugin_id TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        permission TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        status TEXT NOT NULL,
        approved_by TEXT,
        approved_at TEXT,
        PRIMARY KEY(plugin_id, plugin_version, permission, scope_json),
        FOREIGN KEY(plugin_id, plugin_version)
          REFERENCES source_reader_plugin_versions(plugin_id, version) ON DELETE CASCADE
      );
      CREATE INDEX idx_source_reader_plugins_status
        ON source_reader_plugins(enabled, status);
    `);
  }
}
```

- [ ] **Step 5: Add migration 16 for credentials, network profiles, sessions, and challenges**

```ts
{
  version: 16,
  up(db) {
    db.exec(`
      CREATE TABLE source_reader_credentials (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT,
        plugin_id TEXT,
        domain TEXT,
        name TEXT NOT NULL,
        strategy TEXT NOT NULL,
        encrypted_payload BLOB NOT NULL,
        encryption_metadata_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_source_reader_credentials_resolution
        ON source_reader_credentials(owner_type, owner_id, plugin_id, domain, enabled);

      CREATE TABLE source_reader_network_profiles (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT,
        name TEXT NOT NULL,
        route_type TEXT NOT NULL,
        regions_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        encrypted_config BLOB,
        encryption_metadata_json TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        health_status TEXT NOT NULL DEFAULT 'unknown',
        last_health_check_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_source_reader_network_resolution
        ON source_reader_network_profiles(owner_type, owner_id, enabled, health_status);

      CREATE TABLE source_reader_sessions (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        credential_profile_id TEXT NOT NULL,
        owner_type TEXT NOT NULL,
        owner_id TEXT,
        network_profile_id TEXT,
        network_binding TEXT NOT NULL,
        encrypted_session BLOB NOT NULL,
        encryption_metadata_json TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at TEXT,
        last_used_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(credential_profile_id) REFERENCES source_reader_credentials(id) ON DELETE CASCADE,
        FOREIGN KEY(network_profile_id) REFERENCES source_reader_network_profiles(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_source_reader_sessions_resolution
        ON source_reader_sessions(plugin_id, credential_profile_id, owner_id, network_profile_id, status);

      CREATE TABLE source_reader_auth_challenges (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        credential_profile_id TEXT,
        network_profile_id TEXT,
        owner_id TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        encrypted_state BLOB,
        encryption_metadata_json TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY(credential_profile_id) REFERENCES source_reader_credentials(id) ON DELETE CASCADE,
        FOREIGN KEY(network_profile_id) REFERENCES source_reader_network_profiles(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_source_reader_challenges_pending
        ON source_reader_auth_challenges(status, expires_at);
    `);
  }
}
```

- [ ] **Step 6: Add migration 17 for cache, installations, and health history**

```ts
{
  version: 17,
  up(db) {
    db.exec(`
      CREATE TABLE source_reader_cache_entries (
        cache_key TEXT PRIMARY KEY,
        capability TEXT NOT NULL,
        plugin_id TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        contract_version INTEGER NOT NULL,
        normalized_url TEXT,
        request_fingerprint TEXT NOT NULL,
        scope TEXT NOT NULL,
        scope_identity_hash TEXT NOT NULL,
        network_scope_hash TEXT NOT NULL,
        payload BLOB NOT NULL,
        encoding TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        stale_until TEXT,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_accessed_at TEXT NOT NULL
      );
      CREATE INDEX idx_source_reader_cache_expiry
        ON source_reader_cache_entries(expires_at, stale_until);
      CREATE INDEX idx_source_reader_cache_plugin
        ON source_reader_cache_entries(plugin_id, plugin_version, capability);

      CREATE TABLE source_reader_installations (
        id TEXT PRIMARY KEY,
        plugin_id TEXT,
        plugin_version TEXT,
        original_package_path TEXT NOT NULL,
        staging_path TEXT,
        status TEXT NOT NULL,
        error_code TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE source_reader_health_checks (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        capability TEXT,
        status TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        failure_code TEXT,
        checked_at TEXT NOT NULL
      );
      CREATE INDEX idx_source_reader_health_plugin_checked
        ON source_reader_health_checks(plugin_id, checked_at DESC);
    `);
  }
}
```

- [ ] **Step 7: Run schema, ownership, migration, and backup integration tests**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test \
  tests/integration/source-reader-schema.test.ts \
  tests/integration/sqlite-transaction.test.ts \
  tests/integration/backup-module.test.ts \
  tests/regression/source-reader-persistence-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit migrations**

```bash
git add apps/api/src/shared/database/sqlite.ts tests/integration/source-reader-schema.test.ts tests/regression/source-reader-persistence-boundary.test.ts
git commit -m "feat(source-reader): add owned database schema"
```

---

### Task 2: Implement SecretVault and encrypted record format

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/secret-vault.port.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts`
- Modify: `apps/api/src/shared/config/env.ts`
- Test: `tests/regression/source-reader-secret-vault.test.ts`

**Interfaces:**
- Consumes: a 32-byte master key loaded from `SOURCE_READER_MASTER_KEY`.
- Produces: `SecretVault.seal()` and `unseal()` with AES-256-GCM, per-record nonce, and additional authenticated data.

- [ ] **Step 1: Write failing vault tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalEncryptedVault } from '../../apps/api/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

const context = {
  recordType: 'credential',
  recordId: 'cred-1',
  ownerType: 'user',
  ownerId: 'user-1',
  pluginId: 'demo'
} as const;

test('vault round-trips bytes and binds ciphertext to record context', async () => {
  const vault = new LocalEncryptedVault(Buffer.alloc(32, 7));
  const sealed = await vault.seal(Buffer.from('secret'), context);
  assert.equal((await vault.unseal(sealed, context)).toString(), 'secret');
  await assert.rejects(() => vault.unseal(sealed, { ...context, recordId: 'cred-2' }));
});

test('unavailable vault returns stable degraded-mode error', async () => {
  const vault = new LocalEncryptedVault(undefined);
  await assert.rejects(
    () => vault.seal(Buffer.from('secret'), context),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SECRET_VAULT_UNAVAILABLE'
  );
});
```

- [ ] **Step 2: Run the test and verify missing vault modules**

Run:

```bash
node --import tsx --test tests/regression/source-reader-secret-vault.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define the vault port**

```ts
// apps/api/src/modules/source-reader/application/ports/secret-vault.port.ts
export interface SecretContext {
  recordType: 'credential' | 'network-profile' | 'session' | 'auth-challenge';
  recordId: string;
  ownerType?: 'system' | 'user';
  ownerId?: string;
  pluginId?: string;
}

export interface SealedSecret {
  ciphertext: Uint8Array;
  metadata: {
    algorithm: 'aes-256-gcm';
    keyVersion: number;
    nonce: string;
    authTag: string;
  };
}

export interface SecretVault {
  readonly available: boolean;
  seal(value: Uint8Array, context: SecretContext): Promise<SealedSecret>;
  unseal(secret: SealedSecret, context: SecretContext): Promise<Uint8Array>;
}
```

- [ ] **Step 4: Implement AES-256-GCM vault**

```ts
// apps/api/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type {
  SealedSecret,
  SecretContext,
  SecretVault
} from '../../application/ports/secret-vault.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

function aad(context: SecretContext): Buffer {
  return Buffer.from(
    JSON.stringify({
      recordType: context.recordType,
      recordId: context.recordId,
      ownerType: context.ownerType ?? null,
      ownerId: context.ownerId ?? null,
      pluginId: context.pluginId ?? null
    })
  );
}

export class LocalEncryptedVault implements SecretVault {
  readonly available: boolean;

  constructor(private readonly masterKey?: Buffer) {
    if (masterKey && masterKey.length !== 32) {
      throw new Error('SOURCE_READER_MASTER_KEY must decode to exactly 32 bytes');
    }
    this.available = Boolean(masterKey);
  }

  async seal(value: Uint8Array, context: SecretContext): Promise<SealedSecret> {
    const key = this.requireKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad(context));
    const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
    return {
      ciphertext,
      metadata: {
        algorithm: 'aes-256-gcm',
        keyVersion: 1,
        nonce: nonce.toString('base64url'),
        authTag: cipher.getAuthTag().toString('base64url')
      }
    };
  }

  async unseal(secret: SealedSecret, context: SecretContext): Promise<Uint8Array> {
    const key = this.requireKey();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(secret.metadata.nonce, 'base64url')
    );
    decipher.setAAD(aad(context));
    decipher.setAuthTag(Buffer.from(secret.metadata.authTag, 'base64url'));
    return Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]);
  }

  private requireKey(): Buffer {
    if (!this.masterKey) {
      throw new SourceReaderError('SECRET_VAULT_UNAVAILABLE', 'Secret vault is unavailable', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    return this.masterKey;
  }
}
```

- [ ] **Step 5: Add strict environment decoding**

```ts
// Add helper to apps/api/src/shared/config/env.ts
function optionalBase64Key(name: string): Buffer | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) throw new Error(`${name} must be base64 for exactly 32 bytes`);
  return decoded;
}
```

```ts
// Add to env
sourceReaderMasterKey: optionalBase64Key('SOURCE_READER_MASTER_KEY')
```

- [ ] **Step 6: Run vault tests and production-safety checks**

Run:

```bash
node --import tsx --test tests/regression/source-reader-secret-vault.test.ts tests/regression/backend-production-safety.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit SecretVault**

```bash
git add apps/api/src/modules/source-reader/application/ports/secret-vault.port.ts apps/api/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts apps/api/src/shared/config/env.ts tests/regression/source-reader-secret-vault.test.ts
git commit -m "feat(source-reader): encrypt module secrets"
```

---

### Task 3: Add credential, network, session, and challenge repositories

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/credential.repository.ts`
- Create: `apps/api/src/modules/source-reader/application/ports/network-profile.repository.ts`
- Create: `apps/api/src/modules/source-reader/application/ports/session.repository.ts`
- Create: `apps/api/src/modules/source-reader/application/ports/auth-challenge.repository.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-network-profile.repository.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-auth-challenge.repository.ts`
- Test: `tests/integration/source-reader-security-repositories.test.ts`

**Interfaces:**
- Consumes: `SqliteDatabase`, `SecretVault`, clock and ID generator supplied by composition.
- Produces: repositories that return metadata plus opaque secret handles, never plaintext payloads.

- [ ] **Step 1: Write failing repository integration tests**

```ts
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';
import { LocalEncryptedVault } from '../../apps/api/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts';
import { SqliteCredentialRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.ts';

const root = await mkdtemp(join(tmpdir(), 'source-reader-security-repo-'));
const database = createSqliteDatabase(join(root, 'test.sqlite'));
const repository = new SqliteCredentialRepository(
  database,
  new LocalEncryptedVault(Buffer.alloc(32, 1))
);

test.after(() => {
  database.close();
  return rm(root, { recursive: true, force: true });
});

test('credential repository stores ciphertext and resolves secret only through a handle', async () => {
  await repository.save({
    id: 'cred-1',
    ownerType: 'user',
    ownerId: 'user-1',
    pluginId: 'demo',
    name: 'Premium',
    strategy: 'form-login',
    secret: { username: 'reader', password: 'secret' },
    enabled: true,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z'
  });
  const row = database.connection
    .prepare('SELECT encrypted_payload FROM source_reader_credentials WHERE id=?')
    .get('cred-1') as { encrypted_payload: Uint8Array };
  assert.doesNotMatch(Buffer.from(row.encrypted_payload).toString('utf8'), /secret/);
  const handle = await repository.findHandleById('cred-1');
  assert.equal(handle?.id, 'cred-1');
  assert.equal('secret' in (handle as object), false);
  assert.deepEqual(await repository.resolveSecret(handle!), {
    username: 'reader',
    password: 'secret'
  });
});
```

- [ ] **Step 2: Run the integration test and verify missing repository modules**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-security-repositories.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define opaque handle ports**

```ts
// apps/api/src/modules/source-reader/application/ports/credential.repository.ts
export interface CredentialHandle {
  id: string;
  ownerType: 'system' | 'user';
  ownerId?: string;
  pluginId?: string;
  domain?: string;
  strategy: 'cookie-import' | 'bearer-token' | 'basic-auth' | 'form-login' | 'custom';
}

export interface CredentialRepository {
  save(input: CredentialHandle & {
    name: string;
    secret: Record<string, unknown>;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  }): Promise<void>;
  findHandleById(id: string): Promise<CredentialHandle | undefined>;
  findCandidates(input: {
    userId?: string;
    pluginId: string;
    domain: string;
  }): Promise<CredentialHandle[]>;
  resolveSecret(handle: CredentialHandle): Promise<Record<string, unknown>>;
  delete(id: string): Promise<void>;
}
```

```ts
// network-profile.repository.ts, session.repository.ts, auth-challenge.repository.ts
export interface NetworkProfileHandle {
  id: string;
  ownerType: 'system' | 'user';
  ownerId?: string;
  routeType: 'direct' | 'http-proxy' | 'socks-proxy' | 'vpn-gateway';
  regions: string[];
  tags: string[];
  healthStatus: 'unknown' | 'healthy' | 'degraded' | 'offline';
}

export interface SessionHandle {
  id: string;
  pluginId: string;
  pluginVersion: string;
  credentialProfileId: string;
  ownerId?: string;
  networkProfileId?: string;
  networkBinding: 'none' | 'preferred' | 'required';
  expiresAt?: string;
}

export interface AuthChallengeHandle {
  id: string;
  pluginId: string;
  type: 'otp' | 'captcha' | 'approval' | 'browser-interaction';
  status: 'pending' | 'completed' | 'expired' | 'cancelled' | 'failed';
  expiresAt: string;
}
```

- [ ] **Step 4: Implement the credential repository with encrypted JSON payloads**

```ts
// apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.ts
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import type {
  CredentialHandle,
  CredentialRepository
} from '../../application/ports/credential.repository.js';
import type { SecretVault } from '../../application/ports/secret-vault.port.js';

export class SqliteCredentialRepository implements CredentialRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly vault: SecretVault
  ) {}

  async save(input: CredentialHandle & {
    name: string;
    secret: Record<string, unknown>;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  }): Promise<void> {
    const context = {
      recordType: 'credential' as const,
      recordId: input.id,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      pluginId: input.pluginId
    };
    const sealed = await this.vault.seal(Buffer.from(JSON.stringify(input.secret)), context);
    this.database.connection
      .prepare(`
        INSERT INTO source_reader_credentials(
          id, owner_type, owner_id, plugin_id, domain, name, strategy,
          encrypted_payload, encryption_metadata_json, enabled, created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          owner_type=excluded.owner_type, owner_id=excluded.owner_id,
          plugin_id=excluded.plugin_id, domain=excluded.domain, name=excluded.name,
          strategy=excluded.strategy, encrypted_payload=excluded.encrypted_payload,
          encryption_metadata_json=excluded.encryption_metadata_json,
          enabled=excluded.enabled, updated_at=excluded.updated_at
      `)
      .run(
        input.id,
        input.ownerType,
        input.ownerId ?? null,
        input.pluginId ?? null,
        input.domain ?? null,
        input.name,
        input.strategy,
        sealed.ciphertext,
        JSON.stringify(sealed.metadata),
        input.enabled ? 1 : 0,
        input.createdAt,
        input.updatedAt
      );
  }

  async findHandleById(id: string): Promise<CredentialHandle | undefined> {
    const row = this.database.connection
      .prepare(`SELECT id, owner_type, owner_id, plugin_id, domain, strategy
                FROM source_reader_credentials WHERE id=? AND enabled=1`)
      .get(id) as
      | {
          id: string;
          owner_type: 'system' | 'user';
          owner_id?: string;
          plugin_id?: string;
          domain?: string;
          strategy: CredentialHandle['strategy'];
        }
      | undefined;
    return row
      ? {
          id: row.id,
          ownerType: row.owner_type,
          ownerId: row.owner_id,
          pluginId: row.plugin_id,
          domain: row.domain,
          strategy: row.strategy
        }
      : undefined;
  }

  async findCandidates(input: { userId?: string; pluginId: string; domain: string }) {
    const rows = this.database.connection
      .prepare(`
        SELECT id FROM source_reader_credentials
        WHERE enabled=1
          AND (plugin_id=? OR plugin_id IS NULL)
          AND (domain=? OR domain IS NULL)
          AND ((owner_type='user' AND owner_id=?) OR owner_type='system')
        ORDER BY CASE WHEN owner_type='user' THEN 0 ELSE 1 END,
                 CASE WHEN plugin_id IS NOT NULL THEN 0 ELSE 1 END,
                 CASE WHEN domain IS NOT NULL THEN 0 ELSE 1 END,
                 updated_at DESC
      `)
      .all(input.pluginId, input.domain, input.userId ?? null) as Array<{ id: string }>;
    return (await Promise.all(rows.map((row) => this.findHandleById(row.id)))).filter(
      (value): value is CredentialHandle => Boolean(value)
    );
  }

  async resolveSecret(handle: CredentialHandle): Promise<Record<string, unknown>> {
    const row = this.database.connection
      .prepare(`SELECT encrypted_payload, encryption_metadata_json
                FROM source_reader_credentials WHERE id=? AND enabled=1`)
      .get(handle.id) as { encrypted_payload: Uint8Array; encryption_metadata_json: string };
    const plaintext = await this.vault.unseal(
      {
        ciphertext: row.encrypted_payload,
        metadata: JSON.parse(row.encryption_metadata_json)
      },
      {
        recordType: 'credential',
        recordId: handle.id,
        ownerType: handle.ownerType,
        ownerId: handle.ownerId,
        pluginId: handle.pluginId
      }
    );
    return JSON.parse(Buffer.from(plaintext).toString('utf8')) as Record<string, unknown>;
  }

  async delete(id: string): Promise<void> {
    this.database.connection.prepare('DELETE FROM source_reader_credentials WHERE id=?').run(id);
  }
}
```

- [ ] **Step 5: Implement network, session, and challenge repositories with explicit vault helpers and SQL status filters**

```ts
// Required concrete methods and signatures
class SqliteNetworkProfileRepository {
  save(input: NetworkProfileHandle & { name: string; secretConfig?: Record<string, unknown> }): Promise<void>;
  findHandleById(id: string): Promise<NetworkProfileHandle | undefined>;
  findCandidates(input: { userId?: string; regions?: string[]; tags?: string[] }): Promise<NetworkProfileHandle[]>;
  resolveConfig(handle: NetworkProfileHandle): Promise<Record<string, unknown> | undefined>;
}

class SqliteSessionRepository {
  save(input: SessionHandle & { encryptedMaterial: Record<string, unknown>; status: 'active' | 'expired' | 'revoked'; createdAt: string }): Promise<void>;
  findActive(input: { pluginId: string; credentialProfileId: string; ownerId?: string; networkProfileId?: string }): Promise<SessionHandle | undefined>;
  resolveMaterial(handle: SessionHandle): Promise<Record<string, unknown>>;
  revokeByCredential(credentialProfileId: string): Promise<void>;
  expireBefore(now: string): Promise<number>;
}

class SqliteAuthChallengeRepository {
  save(input: AuthChallengeHandle & { encryptedState?: Record<string, unknown>; credentialProfileId?: string; networkProfileId?: string; ownerId?: string; createdAt: string }): Promise<void>;
  findPendingById(id: string): Promise<AuthChallengeHandle | undefined>;
  resolveState(handle: AuthChallengeHandle): Promise<Record<string, unknown> | undefined>;
  complete(id: string, completedAt: string): Promise<void>;
  expireBefore(now: string): Promise<number>;
}
```

Use these helpers in all three repositories:

```ts
async function sealJson(
  vault: SecretVault,
  value: Record<string, unknown>,
  context: SecretContext
) {
  return vault.seal(Buffer.from(JSON.stringify(value), 'utf8'), context);
}

async function unsealJson(
  vault: SecretVault,
  sealed: { ciphertext: Uint8Array; metadata: Record<string, unknown> },
  context: SecretContext
): Promise<Record<string, unknown>> {
  const bytes = await vault.unseal(sealed, context);
  return JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>;
}
```

`SqliteNetworkProfileRepository.findCandidates()` must query `enabled=1 AND health_status IN ('unknown','healthy','degraded')`, apply owner precedence in SQL, and filter requested region/tag intersections before returning opaque handles. `SqliteSessionRepository.findActive()` must query `status='active'` and `(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)` while matching plugin, credential, owner, and network scope. `SqliteAuthChallengeRepository.findPendingById()` must query `status='pending' AND expires_at > CURRENT_TIMESTAMP`. `SqliteCredentialRepository.delete()` must run `UPDATE source_reader_sessions SET status='revoked' WHERE credential_profile_id=?` and credential deletion in one database transaction.

- [ ] **Step 6: Extend the integration test for all repositories**

```ts
test('security repositories preserve owner, route, and expiry boundaries', async () => {
  const fixture = await createSecurityRepositoryFixture();
  await fixture.networkProfiles.save(userUsRoute);
  await fixture.networkProfiles.save(systemUsRoute);
  await fixture.networkProfiles.save({ ...offlineRoute, healthStatus: 'offline' });
  assert.deepEqual(
    (await fixture.networkProfiles.findCandidates({ userId: 'u1', regions: ['US'] })).map((item) => item.id),
    ['user-us', 'system-us']
  );

  await fixture.sessions.save(activeBoundSession);
  assert.equal(
    (await fixture.sessions.findActive({
      pluginId: 'demo',
      credentialProfileId: 'credential-u1',
      ownerId: 'u1',
      networkProfileId: 'user-us'
    }))?.id,
    activeBoundSession.id
  );
  assert.equal(
    await fixture.sessions.findActive({
      pluginId: 'demo',
      credentialProfileId: 'credential-u1',
      ownerId: 'u1',
      networkProfileId: 'system-us'
    }),
    undefined
  );

  await fixture.credentials.delete('credential-u1');
  assert.equal(await fixture.sessions.findActive({
    pluginId: 'demo', credentialProfileId: 'credential-u1', ownerId: 'u1', networkProfileId: 'user-us'
  }), undefined);

  await fixture.challenges.save(expiredChallenge);
  assert.equal(await fixture.challenges.findPendingById(expiredChallenge.id), undefined);
});
```

- [ ] **Step 7: Run security repository, data integrity, and transaction tests**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test \
  tests/integration/source-reader-security-repositories.test.ts \
  tests/integration/data-integrity.test.ts \
  tests/integration/sqlite-transaction.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 8: Commit security repositories**

```bash
git add apps/api/src/modules/source-reader/application/ports apps/api/src/modules/source-reader/infrastructure/sqlite tests/integration/source-reader-security-repositories.test.ts
git commit -m "feat(source-reader): persist encrypted runtime profiles"
```

---

### Task 4: Resolve credential, session, and network runtime context

**Files:**
- Create: `apps/api/src/modules/source-reader/application/ports/runtime-context-resolver.port.ts`
- Create: `apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts`
- Modify: `apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Test: `tests/regression/source-reader-runtime-context.test.ts`

**Interfaces:**
- Consumes: credential/network/session repositories and plugin manifest requirements.
- Produces: `ResolvedRuntimeContext` containing handles and cache identities but no plaintext secrets.

- [ ] **Step 1: Write failing precedence and route-requirement tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { RuntimeContextResolverService } from '../../apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

const credentials = {
  findHandleById: async (id: string) =>
    id === 'explicit' ? { id, ownerType: 'user', ownerId: 'u1', strategy: 'form-login' } : undefined,
  findCandidates: async () => [
    { id: 'user-default', ownerType: 'user', ownerId: 'u1', strategy: 'form-login' },
    { id: 'system-default', ownerType: 'system', strategy: 'form-login' }
  ]
};
const sessions = { findActive: async () => undefined };
const networks = {
  findHandleById: async () => undefined,
  findCandidates: async () => []
};

test('explicit user credential wins over defaults', async () => {
  const resolver = new RuntimeContextResolverService(credentials as never, networks as never, sessions as never);
  const result = await resolver.resolve({
    userId: 'u1',
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    domain: 'example.test',
    capability: 'metadata',
    credentialProfileId: 'explicit',
    runtimeRequirements: {}
  });
  assert.equal(result.credential?.id, 'explicit');
});

test('required regional route fails explicitly when unavailable', async () => {
  const resolver = new RuntimeContextResolverService(credentials as never, networks as never, sessions as never);
  await assert.rejects(
    () =>
      resolver.resolve({
        pluginId: 'demo',
        pluginVersion: '1.0.0',
        domain: 'example.test',
        capability: 'metadata',
        runtimeRequirements: {
          network: {
            required: true,
            regions: ['US'],
            allowDirectFallback: false
          }
        }
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'NETWORK_REGION_UNAVAILABLE'
  );
});
```

- [ ] **Step 2: Run the test and verify missing resolver**

Run:

```bash
node --import tsx --test tests/regression/source-reader-runtime-context.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Define resolver contract**

```ts
// apps/api/src/modules/source-reader/application/ports/runtime-context-resolver.port.ts
import type { CredentialHandle } from './credential.repository.js';
import type { NetworkProfileHandle } from './network-profile.repository.js';
import type { SessionHandle } from './session.repository.js';
import type { SourceCapability } from '../../public/source-reader.models.js';
import type { SourcePluginManifest } from '../../domain/plugin/source-plugin.js';

export interface ResolvedRuntimeContext {
  credential?: CredentialHandle;
  session?: SessionHandle;
  networkRoute?: NetworkProfileHandle;
  executionMode: 'in-process' | 'isolated';
  browserRequired: boolean;
  cacheIdentity: {
    authScope: string;
    networkScope: string;
  };
}

export interface RuntimeContextResolverPort {
  resolve(input: {
    userId?: string;
    pluginId: string;
    pluginVersion: string;
    domain: string;
    capability: SourceCapability;
    credentialProfileId?: string;
    networkProfileId?: string;
    executionMode?: 'in-process' | 'isolated';
    runtimeRequirements?: SourcePluginManifest['runtimeRequirements'];
  }): Promise<ResolvedRuntimeContext>;
}
```

- [ ] **Step 4: Implement precedence and requirement validation**

```ts
// apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts
import { createHash } from 'node:crypto';
import type { CredentialRepository } from '../ports/credential.repository.js';
import type { NetworkProfileRepository } from '../ports/network-profile.repository.js';
import type { RuntimeContextResolverPort } from '../ports/runtime-context-resolver.port.js';
import type { SessionRepository } from '../ports/session.repository.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export class RuntimeContextResolverService implements RuntimeContextResolverPort {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly networks: NetworkProfileRepository,
    private readonly sessions: SessionRepository
  ) {}

  async resolve(input: Parameters<RuntimeContextResolverPort['resolve']>[0]) {
    const credential = input.credentialProfileId
      ? await this.credentials.findHandleById(input.credentialProfileId)
      : (
          await this.credentials.findCandidates({
            userId: input.userId,
            pluginId: input.pluginId,
            domain: input.domain
          })
        )[0];

    if (input.runtimeRequirements?.authentication?.required && !credential) {
      throw new SourceReaderError('CREDENTIAL_NOT_CONFIGURED', 'Source credential is required', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    if (credential?.ownerType === 'user' && credential.ownerId !== input.userId) {
      throw new SourceReaderError('PLUGIN_PERMISSION_DENIED', 'Credential is not owned by the actor', {
        retryable: false,
        fallbackAllowed: false
      });
    }

    const requirement = input.runtimeRequirements?.network;
    const networkRoute = input.networkProfileId
      ? await this.networks.findHandleById(input.networkProfileId)
      : (
          await this.networks.findCandidates({
            userId: input.userId,
            regions: requirement?.regions,
            tags: requirement?.routeTags
          })
        )[0];

    if (networkRoute?.ownerType === 'user' && networkRoute.ownerId !== input.userId) {
      throw new SourceReaderError('PLUGIN_PERMISSION_DENIED', 'Network profile is not owned by the actor', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    if (networkRoute?.healthStatus === 'offline') {
      throw new SourceReaderError('NETWORK_ROUTE_OFFLINE', 'Selected network route is offline', {
        retryable: true,
        fallbackAllowed: true
      });
    }
    if (requirement?.required && !networkRoute && !requirement.allowDirectFallback) {
      throw new SourceReaderError(
        requirement.regions?.length ? 'NETWORK_REGION_UNAVAILABLE' : 'NETWORK_ROUTE_REQUIRED',
        'Required network route is unavailable',
        { retryable: true, fallbackAllowed: true }
      );
    }

    const session = credential
      ? await this.sessions.findActive({
          pluginId: input.pluginId,
          credentialProfileId: credential.id,
          ownerId: input.userId,
          networkProfileId: networkRoute?.id
        })
      : undefined;

    return {
      credential,
      session,
      networkRoute,
      executionMode: input.executionMode ?? 'in-process',
      browserRequired: false,
      cacheIdentity: {
        authScope: credential ? hash(`${credential.ownerType}:${credential.id}`) : 'anonymous',
        networkScope: networkRoute ? hash(networkRoute.id) : 'direct'
      }
    };
  }
}
```

- [ ] **Step 5: Pass resolved context into SourceReaderService and PluginContextFactory**

```ts
// Add resolver dependency to SourceReaderService constructor.
// Before creating PluginContext:
const runtimeContext = await this.runtimeContexts.resolve({
  userId: request.userId as string | undefined,
  pluginId: candidate.plugin.manifest.id,
  pluginVersion: candidate.plugin.manifest.version,
  domain: candidate.domain,
  capability,
  credentialProfileId: request.credentialProfileId as string | undefined,
  networkProfileId: request.networkProfileId as string | undefined,
  executionMode: candidate.executionMode,
  runtimeRequirements: candidate.plugin.manifest.runtimeRequirements
});
```

```ts
// Extend PluginContextFactoryPort.create input with runtimeContext.
// Keep handles opaque; actual secret attachment is added in the auth/browser plan.
```

- [ ] **Step 6: Run resolver, service, and cache tests**

Run:

```bash
node --import tsx --test \
  tests/regression/source-reader-runtime-context.test.ts \
  tests/regression/source-reader-service.test.ts
npm run check -w @novel-tool/api
```

Expected: PASS.

- [ ] **Step 7: Commit runtime context resolution**

```bash
git add apps/api/src/modules/source-reader/application/ports/runtime-context-resolver.port.ts apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts apps/api/src/modules/source-reader/application/services/source-reader.service.ts apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts tests/regression/source-reader-runtime-context.test.ts
git commit -m "feat(source-reader): resolve auth and network context"
```

---

### Task 5: Add persistent scope-aware cache below memory cache

**Files:**
- Create: `apps/api/src/modules/source-reader/infrastructure/cache/sqlite-reader.cache.ts`
- Create: `apps/api/src/modules/source-reader/infrastructure/cache/tiered-reader.cache.ts`
- Modify: `apps/api/src/modules/source-reader/application/services/source-reader.service.ts`
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Test: `tests/integration/source-reader-cache-isolation.test.ts`

**Interfaces:**
- Consumes: `ReaderCachePort`, database, plugin/cache/runtime identities.
- Produces: memory→SQLite cache with scope isolation, stale metadata, tag invalidation, and cleanup.

- [ ] **Step 1: Write failing cache isolation tests**

```ts
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';
import { SqliteReaderCache } from '../../apps/api/src/modules/source-reader/infrastructure/cache/sqlite-reader.cache.ts';

const root = await mkdtemp(join(tmpdir(), 'source-reader-cache-'));
const database = createSqliteDatabase(join(root, 'test.sqlite'));
const cache = new SqliteReaderCache(database);

test.after(() => {
  database.close();
  return rm(root, { recursive: true, force: true });
});

test('account-scoped cache keys cannot cross account identity', async () => {
  await cache.set('account-a-key', {
    value: { premium: true },
    expiresAt: Date.now() + 60_000,
    tags: ['credential:account-a']
  });
  assert.deepEqual((await cache.get<{ premium: boolean }>('account-a-key'))?.value, {
    premium: true
  });
  assert.equal(await cache.get('account-b-key'), undefined);
});

test('tag invalidation removes matching persisted entries only', async () => {
  await cache.set('one', { value: 1, expiresAt: Date.now() + 60_000, tags: ['plugin:one'] });
  await cache.set('two', { value: 2, expiresAt: Date.now() + 60_000, tags: ['plugin:two'] });
  await cache.invalidate(['plugin:one']);
  assert.equal(await cache.get('one'), undefined);
  assert.equal((await cache.get<number>('two'))?.value, 2);
});
```

- [ ] **Step 2: Run the test and verify missing cache modules**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-cache-isolation.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the SQLite cache**

```ts
// apps/api/src/modules/source-reader/infrastructure/cache/sqlite-reader.cache.ts
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import type {
  ReaderCacheEntry,
  ReaderCachePort
} from '../../application/ports/reader-cache.port.js';

export class SqliteReaderCache implements ReaderCachePort {
  constructor(private readonly database: SqliteDatabase) {}

  async get<T>(key: string): Promise<ReaderCacheEntry<T> | undefined> {
    const row = this.database.connection
      .prepare(`SELECT payload, expires_at, stale_until, tags_json
                FROM source_reader_cache_entries WHERE cache_key=?`)
      .get(key) as
      | { payload: Uint8Array; expires_at: string; stale_until?: string; tags_json: string }
      | undefined;
    if (!row) return undefined;
    this.database.connection
      .prepare('UPDATE source_reader_cache_entries SET last_accessed_at=? WHERE cache_key=?')
      .run(new Date().toISOString(), key);
    return {
      value: JSON.parse(Buffer.from(row.payload).toString('utf8')) as T,
      expiresAt: Date.parse(row.expires_at),
      staleUntil: row.stale_until ? Date.parse(row.stale_until) : undefined,
      tags: JSON.parse(row.tags_json) as string[]
    };
  }

  async set<T>(key: string, entry: ReaderCacheEntry<T>): Promise<void> {
    const now = new Date().toISOString();
    this.database.connection
      .prepare(`
        INSERT INTO source_reader_cache_entries(
          cache_key, capability, plugin_id, plugin_version, contract_version,
          normalized_url, request_fingerprint, scope, scope_identity_hash,
          network_scope_hash, payload, encoding, expires_at, stale_until,
          tags_json, created_at, last_accessed_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(cache_key) DO UPDATE SET
          payload=excluded.payload, expires_at=excluded.expires_at,
          stale_until=excluded.stale_until, tags_json=excluded.tags_json,
          last_accessed_at=excluded.last_accessed_at
      `)
      .run(
        key,
        'metadata',
        'internal',
        '0.0.0',
        1,
        null,
        key,
        'public',
        'public',
        'direct',
        Buffer.from(JSON.stringify(entry.value)),
        'json',
        new Date(entry.expiresAt).toISOString(),
        entry.staleUntil ? new Date(entry.staleUntil).toISOString() : null,
        JSON.stringify(entry.tags),
        now,
        now
      );
  }

  async invalidate(tags: string[]): Promise<void> {
    const rows = this.database.connection
      .prepare('SELECT cache_key, tags_json FROM source_reader_cache_entries')
      .all() as Array<{ cache_key: string; tags_json: string }>;
    const requested = new Set(tags);
    const remove = this.database.connection.prepare(
      'DELETE FROM source_reader_cache_entries WHERE cache_key=?'
    );
    for (const row of rows) {
      const entryTags = JSON.parse(row.tags_json) as string[];
      if (entryTags.some((tag) => requested.has(tag))) remove.run(row.cache_key);
    }
  }

  async deleteExpired(now = Date.now()): Promise<number> {
    const result = this.database.connection
      .prepare(`DELETE FROM source_reader_cache_entries
                WHERE COALESCE(stale_until, expires_at) <= ?`)
      .run(new Date(now).toISOString());
    return Number(result.changes);
  }
}
```

- [ ] **Step 4: Implement tiered cache**

```ts
// apps/api/src/modules/source-reader/infrastructure/cache/tiered-reader.cache.ts
import type {
  ReaderCacheEntry,
  ReaderCachePort
} from '../../application/ports/reader-cache.port.js';

export class TieredReaderCache implements ReaderCachePort {
  constructor(
    private readonly memory: ReaderCachePort,
    private readonly persistent: ReaderCachePort
  ) {}

  async get<T>(key: string): Promise<ReaderCacheEntry<T> | undefined> {
    const hot = await this.memory.get<T>(key);
    if (hot) return hot;
    const persisted = await this.persistent.get<T>(key);
    if (persisted) await this.memory.set(key, persisted);
    return persisted;
  }

  async set<T>(key: string, entry: ReaderCacheEntry<T>): Promise<void> {
    await Promise.all([this.memory.set(key, entry), this.persistent.set(key, entry)]);
  }

  async invalidate(tags: string[]): Promise<void> {
    await Promise.all([this.memory.invalidate(tags), this.persistent.invalidate(tags)]);
  }
}
```

- [ ] **Step 5: Build cache key from scope and runtime identities**

```ts
// Replace the simple fingerprint input in SourceReaderService with:
const effectiveScope = this.narrowCacheScope(
  operation.cacheHints?.scope ?? 'public',
  runtimeContext
);
const cacheKey = this.fingerprint({
  capability,
  normalizedUrl: candidate.normalizedUrl,
  requestParameters: this.cacheableRequest(request),
  pluginId: candidate.plugin.manifest.id,
  pluginVersion: candidate.plugin.manifest.version,
  contractVersion: candidate.plugin.manifest.contracts[capability],
  extensionContracts: candidate.plugin.manifest.extensionContracts ?? {},
  cacheScope: effectiveScope,
  authScopeIdentity: effectiveScope === 'public' ? 'public' : runtimeContext.cacheIdentity.authScope,
  networkScopeIdentity: runtimeContext.cacheIdentity.networkScope
});
```

```ts
private narrowCacheScope(
  requested: CacheScope,
  runtime: ResolvedRuntimeContext
): CacheScope {
  if (requested === 'none') return 'none';
  if (runtime.session) return requested === 'public' ? 'session' : requested;
  if (runtime.credential) return requested === 'public' ? 'account' : requested;
  return requested;
}
```

- [ ] **Step 6: Compose tiered cache in `source-reader.module.ts`**

```ts
const cache = new TieredReaderCache(
  new MemoryReaderCache(env.sourceReaderMemoryCacheEntries),
  new SqliteReaderCache(infrastructure.database)
);
```

- [ ] **Step 7: Run cache isolation, service, and full integration tests**

Run:

```bash
npm run build:shared && node --experimental-sqlite --import tsx --test \
  tests/integration/source-reader-cache-isolation.test.ts \
  tests/integration/source-reader-security-repositories.test.ts
node --import tsx --test tests/regression/source-reader-service.test.ts
npm run test:integration
```

Expected: PASS.

- [ ] **Step 8: Commit persistent cache**

```bash
git add apps/api/src/modules/source-reader/infrastructure/cache apps/api/src/modules/source-reader/application/services/source-reader.service.ts apps/api/src/shared/container/modules/source-reader.module.ts tests/integration/source-reader-cache-isolation.test.ts
git commit -m "feat(source-reader): add scoped persistent cache"
```

---

### Task 6: Compose repositories, degraded mode, and maintenance cleanup

**Files:**
- Modify: `apps/api/src/shared/container/modules/source-reader.module.ts`
- Create: `apps/api/src/modules/source-reader/application/services/source-reader-maintenance.service.ts`
- Test: `tests/integration/source-reader-degraded-mode.test.ts`
- Test: `tests/regression/source-reader-maintenance.test.ts`

**Interfaces:**
- Consumes: database, vault, repositories, context resolver, persistent cache.
- Produces: complete Source Reader lifecycle with safe degraded startup and cleanup.

- [ ] **Step 1: Write failing degraded-mode integration test**

```ts
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const storageDir = await mkdtemp(join(tmpdir(), 'source-reader-degraded-'));
process.env.STORAGE_DIR = storageDir;
delete process.env.SOURCE_READER_MASTER_KEY;
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

test('public source reading remains available without a master key', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
});
```

- [ ] **Step 2: Implement maintenance cleanup service**

```ts
// apps/api/src/modules/source-reader/application/services/source-reader-maintenance.service.ts
export class SourceReaderMaintenanceService {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly cache: { deleteExpired(now?: number): Promise<number> },
    private readonly sessions: { expireBefore(now: string): Promise<number> },
    private readonly challenges: { expireBefore(now: string): Promise<number> },
    private readonly now: () => Date,
    private readonly intervalMs = 15 * 60_000
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(): Promise<void> {
    const now = this.now();
    await Promise.all([
      this.cache.deleteExpired(now.getTime()),
      this.sessions.expireBefore(now.toISOString()),
      this.challenges.expireBefore(now.toISOString())
    ]);
  }
}
```

- [ ] **Step 3: Compose vault, repositories, resolver, cache, and maintenance**

```ts
const vault = new LocalEncryptedVault(env.sourceReaderMasterKey);
const credentials = new SqliteCredentialRepository(infrastructure.database, vault);
const networks = new SqliteNetworkProfileRepository(infrastructure.database, vault);
const sessions = new SqliteSessionRepository(infrastructure.database, vault);
const challenges = new SqliteAuthChallengeRepository(infrastructure.database, vault);
const persistentCache = new SqliteReaderCache(infrastructure.database);
const cache = new TieredReaderCache(
  new MemoryReaderCache(env.sourceReaderMemoryCacheEntries),
  persistentCache
);
const runtimeContexts = new RuntimeContextResolverService(credentials, networks, sessions);
const maintenance = new SourceReaderMaintenanceService(
  persistentCache,
  sessions,
  challenges,
  () => infrastructure.clock.now()
);
```

```ts
lifecycle: {
  async start() {
    maintenance.start();
  },
  async stop() {
    await maintenance.stop();
  }
}
```

- [ ] **Step 4: Write and run maintenance behavior test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceReaderMaintenanceService } from '../../apps/api/src/modules/source-reader/application/services/source-reader-maintenance.service.ts';

test('maintenance expires cache, sessions, and challenges in one pass', async () => {
  const calls: string[] = [];
  const service = new SourceReaderMaintenanceService(
    { deleteExpired: async () => (calls.push('cache'), 1) },
    { expireBefore: async () => (calls.push('sessions'), 1) },
    { expireBefore: async () => (calls.push('challenges'), 1) },
    () => new Date('2026-07-19T00:00:00.000Z')
  );
  await service.runOnce();
  assert.deepEqual(calls.sort(), ['cache', 'challenges', 'sessions']);
});
```

Run:

```bash
node --import tsx --test tests/regression/source-reader-maintenance.test.ts
npm run build:shared && node --experimental-sqlite --import tsx --test tests/integration/source-reader-degraded-mode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full state/security gate**

Run:

```bash
npm run check:arch
npm run check -w @novel-tool/api
npm run test:regression
npm run test:integration
```

Expected: PASS.

- [ ] **Step 6: Commit state/security composition**

```bash
git add apps/api/src/shared/container/modules/source-reader.module.ts apps/api/src/modules/source-reader/application/services/source-reader-maintenance.service.ts tests/integration/source-reader-degraded-mode.test.ts tests/regression/source-reader-maintenance.test.ts
git commit -m "feat(source-reader): compose secure persistent state"
```

## Plan completion gate

Run:

```bash
npm run verify
```

Expected: exit `0`; public anonymous reading works without a master key, secret-dependent operations return `SECRET_VAULT_UNAVAILABLE`, and cache/session/challenge cleanup is active only through Source Reader lifecycle.
