import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ExternalPluginRevalidationService } from '../../apps/api/src/modules/source-reader/application/services/external-plugin-revalidation.service.ts';
import type { StoredPluginVersion } from '../../apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts';
import {
  CURRENT_SCHEMA_VERSION,
  SqliteDatabase
} from '../../apps/api/src/shared/database/sqlite.ts';

const manifest = {
  id: 'external-demo',
  name: 'External Demo',
  version: '1.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['metadata'] as const,
  contracts: { metadata: 1 },
  matchers: [{ hosts: ['example.test'], priority: 10 }],
  runtime: { preferredMode: 'isolated' as const },
  permissions: { network: { hosts: ['example.test'] } }
};

function version(id: string): StoredPluginVersion {
  return {
    pluginId: id,
    version: '1.0.0',
    trustLevel: 'local-unverified',
    status: 'installed-pending-revalidation',
    packagePath: `/plugins/${id}/1.0.0`,
    checksum: 'checksum',
    signatureStatus: 'unsigned',
    manifest: { ...manifest, id, name: id }
  };
}

test('migration 22 disables external plugins, revokes sessions, and removes external cache fail closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'source-reader-fail-closed-'));
  const database = new SqliteDatabase(join(root, 'test.sqlite'));
  t.after(async () => {
    database.close();
    await rm(root, { recursive: true, force: true });
  });

  database.connection.exec(`
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE source_reader_plugins(
      id TEXT PRIMARY KEY, name TEXT NOT NULL, trust_level TEXT NOT NULL, status TEXT NOT NULL,
      active_version TEXT, enabled INTEGER NOT NULL, installed_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE source_reader_plugin_versions(
      plugin_id TEXT NOT NULL, version TEXT NOT NULL, trust_level TEXT NOT NULL, status TEXT NOT NULL,
      activated_at TEXT, PRIMARY KEY(plugin_id, version)
    );
    CREATE TABLE source_reader_sessions(
      id TEXT PRIMARY KEY, plugin_id TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE source_reader_cache_entries(
      cache_key TEXT PRIMARY KEY, plugin_id TEXT NOT NULL
    );
  `);
  const insertMigration = database.connection.prepare(
    'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)'
  );
  for (let migration = 1; migration <= 21; migration += 1) {
    insertMigration.run(migration, '2026-07-20T00:00:00.000Z');
  }
  const insertPlugin = database.connection.prepare(
    `INSERT INTO source_reader_plugins(
      id, name, trust_level, status, active_version, enabled, installed_at, updated_at
    ) VALUES(?,?,?,?,?,?,?,?)`
  );
  insertPlugin.run('built-in', 'Built In', 'built-in', 'active', '1.0.0', 1, 'now', 'now');
  insertPlugin.run('external', 'External', 'signed', 'active', '1.0.0', 1, 'now', 'now');
  const insertVersion = database.connection.prepare(
    `INSERT INTO source_reader_plugin_versions(
      plugin_id, version, trust_level, status, activated_at
    ) VALUES(?,?,?,?,?)`
  );
  insertVersion.run('built-in', '1.0.0', 'built-in', 'active', 'now');
  insertVersion.run('external', '1.0.0', 'signed', 'active', 'now');
  database.connection
    .prepare('INSERT INTO source_reader_sessions(id, plugin_id, status) VALUES(?,?,?)')
    .run('session-external', 'external', 'active');
  database.connection
    .prepare('INSERT INTO source_reader_cache_entries(cache_key, plugin_id) VALUES(?,?)')
    .run('cache-built-in', 'built-in');
  database.connection
    .prepare('INSERT INTO source_reader_cache_entries(cache_key, plugin_id) VALUES(?,?)')
    .run('cache-external', 'external');

  database.migrate();

  assert.equal(CURRENT_SCHEMA_VERSION, 22);
  assert.deepEqual(
    database.connection
      .prepare('SELECT id, status, active_version, enabled FROM source_reader_plugins ORDER BY id')
      .all()
      .map((row) => ({ ...(row as Record<string, unknown>) })),
    [
      { id: 'built-in', status: 'active', active_version: '1.0.0', enabled: 1 },
      {
        id: 'external',
        status: 'installed-pending-revalidation',
        active_version: null,
        enabled: 0
      }
    ]
  );
  assert.deepEqual(
    database.connection
      .prepare(
        'SELECT plugin_id, status, activated_at FROM source_reader_plugin_versions ORDER BY plugin_id'
      )
      .all()
      .map((row) => ({ ...(row as Record<string, unknown>) })),
    [
      { plugin_id: 'built-in', status: 'active', activated_at: 'now' },
      {
        plugin_id: 'external',
        status: 'installed-pending-revalidation',
        activated_at: null
      }
    ]
  );
  assert.equal(
    (
      database.connection
        .prepare('SELECT status FROM source_reader_sessions WHERE id=?')
        .get('session-external') as { status: string }
    ).status,
    'revoked'
  );
  assert.deepEqual(
    database.connection
      .prepare('SELECT cache_key FROM source_reader_cache_entries ORDER BY cache_key')
      .all()
      .map((row) => ({ ...(row as Record<string, unknown>) })),
    [{ cache_key: 'cache-built-in' }]
  );
});

test('startup revalidation activates verified packages and quarantines changed packages', async () => {
  const pending = [version('good'), version('changed')];
  const quarantined: Array<{ pluginId: string; version: string; reason: string }> = [];
  const activated: string[] = [];
  const service = new ExternalPluginRevalidationService(
    {
      listPendingRevalidation: async () => pending,
      quarantine: async (pluginId, pluginVersion, reason) => {
        quarantined.push({ pluginId, version: pluginVersion, reason });
      }
    },
    {
      inspect: async (candidate) => {
        if (candidate.pluginId === 'changed') throw new Error('checksum mismatch');
        return new Map<string, Uint8Array>();
      }
    },
    { evaluate: () => ({ compatible: true, issues: [], activatedExtensions: {} }) },
    {
      activate: async ({ pluginId }) => {
        activated.push(pluginId);
        return { pluginId, version: '1.0.0', status: 'active' as const, warnings: [] };
      }
    }
  );

  const result = await service.revalidateAll(new AbortController().signal);

  assert.deepEqual(activated, ['good']);
  assert.deepEqual(quarantined, [
    { pluginId: 'changed', version: '1.0.0', reason: 'PLUGIN_PACKAGE_INVALID' }
  ]);
  assert.deepEqual(result, [
    { pluginId: 'good', version: '1.0.0', status: 'active' },
    {
      pluginId: 'changed',
      version: '1.0.0',
      status: 'quarantined',
      reasonCode: 'PLUGIN_PACKAGE_INVALID'
    }
  ]);
});
