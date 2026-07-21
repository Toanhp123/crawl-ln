import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import type {
  ReaderCacheEntry,
  ReaderCacheMetadata,
  ReaderCachePort
} from '../../application/ports/reader-cache.port.js';
import { sqliteUpsertUpdate } from './sqlite-syntax.js';

interface CacheRow {
  payload: Uint8Array;
  expires_at: string;
  stale_until: string | null;
  plugin_id: string;
  plugin_version: string;
  capability: string;
  contract_version: number;
  extension_contract_versions_json: string;
  normalized_url: string | null;
  request_fingerprint: string;
  scope: ReaderCacheMetadata['scope'];
  scope_identity_hash: string;
  network_identity_hash: string | null;
  network_scope_hash: string;
  tags_json: string;
}

export class SqliteReaderCache implements ReaderCachePort {
  constructor(private readonly database: SqliteDatabase) {}

  async get<T>(key: string): Promise<ReaderCacheEntry<T> | undefined> {
    const row = this.database.connection
      .prepare(
        `SELECT payload, expires_at, stale_until, plugin_id, plugin_version, capability,
                contract_version, extension_contract_versions_json, normalized_url,
                request_fingerprint, scope, scope_identity_hash, network_identity_hash,
                network_scope_hash, tags_json
           FROM source_reader_cache_entries WHERE cache_key=?`
      )
      .get(key) as CacheRow | undefined;
    if (!row) return undefined;
    this.database.connection
      .prepare('UPDATE source_reader_cache_entries SET last_accessed_at=? WHERE cache_key=?')
      .run(new Date().toISOString(), key);
    const tags = this.database.connection
      .prepare('SELECT tag FROM source_reader_cache_tags WHERE cache_key=? ORDER BY tag')
      .all(key)
      .map((item) => (item as { tag: string }).tag);
    const metadata: ReaderCacheMetadata = {
      pluginId: row.plugin_id,
      pluginVersion: row.plugin_version,
      capability: row.capability,
      contractVersion: String(row.contract_version),
      extensionContractVersions: JSON.parse(row.extension_contract_versions_json) as Record<
        string,
        string
      >,
      requestFingerprint: row.request_fingerprint,
      ...(row.normalized_url ? { normalizedUrl: row.normalized_url } : {}),
      scope: row.scope,
      scopeIdentityHash: row.scope_identity_hash,
      networkIdentityHash: row.network_identity_hash ?? row.network_scope_hash,
      tags: tags.length > 0 ? tags : (JSON.parse(row.tags_json) as string[])
    };
    return {
      value: JSON.parse(Buffer.from(row.payload).toString('utf8')) as T,
      expiresAt: Date.parse(row.expires_at),
      ...(row.stale_until ? { staleUntil: Date.parse(row.stale_until) } : {}),
      metadata
    };
  }

  async set<T>(key: string, entry: ReaderCacheEntry<T>): Promise<void> {
    const now = new Date().toISOString();
    const metadata = entry.metadata;
    this.database.transactionSync(() => {
      this.database.connection
        .prepare(
          `INSERT INTO source_reader_cache_entries(
             cache_key, capability, plugin_id, plugin_version, contract_version,
             extension_contract_versions_json, normalized_url, request_fingerprint,
             scope, scope_identity_hash, network_scope_hash, network_identity_hash,
             payload, encoding, expires_at, stale_until, tags_json, created_at, last_accessed_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(cache_key) ${sqliteUpsertUpdate}
             capability=excluded.capability,
             plugin_id=excluded.plugin_id,
             plugin_version=excluded.plugin_version,
             contract_version=excluded.contract_version,
             extension_contract_versions_json=excluded.extension_contract_versions_json,
             normalized_url=excluded.normalized_url,
             request_fingerprint=excluded.request_fingerprint,
             scope=excluded.scope,
             scope_identity_hash=excluded.scope_identity_hash,
             network_scope_hash=excluded.network_scope_hash,
             network_identity_hash=excluded.network_identity_hash,
             payload=excluded.payload,
             expires_at=excluded.expires_at,
             stale_until=excluded.stale_until,
             tags_json=excluded.tags_json,
             last_accessed_at=excluded.last_accessed_at`
        )
        .run(
          key,
          metadata.capability,
          metadata.pluginId,
          metadata.pluginVersion,
          Number(metadata.contractVersion),
          JSON.stringify(metadata.extensionContractVersions),
          metadata.normalizedUrl ?? null,
          metadata.requestFingerprint,
          metadata.scope,
          metadata.scopeIdentityHash,
          metadata.networkIdentityHash,
          metadata.networkIdentityHash,
          Buffer.from(JSON.stringify(entry.value)),
          'json',
          new Date(entry.expiresAt).toISOString(),
          entry.staleUntil ? new Date(entry.staleUntil).toISOString() : null,
          JSON.stringify(metadata.tags),
          now,
          now
        );
      this.database.connection
        .prepare('DELETE FROM source_reader_cache_tags WHERE cache_key=?')
        .run(key);
      const insertTag = this.database.connection.prepare(
        'INSERT INTO source_reader_cache_tags(cache_key, tag) VALUES(?,?)'
      );
      for (const tag of [...new Set(metadata.tags)].sort()) insertTag.run(key, tag);
    });
  }

  async invalidate(tags: string[]): Promise<void> {
    const unique = [...new Set(tags)].filter(Boolean);
    if (unique.length === 0) return;
    const placeholders = unique.map(() => '?').join(',');
    this.database.connection
      .prepare(
        `DELETE FROM source_reader_cache_entries
         WHERE cache_key IN (
           SELECT cache_key FROM source_reader_cache_tags WHERE tag IN (${placeholders})
         )`
      )
      .run(...unique);
  }

  async deleteExpired(now = Date.now()): Promise<number> {
    const result = this.database.connection
      .prepare(
        `DELETE FROM source_reader_cache_entries
         WHERE COALESCE(stale_until, expires_at) <= ?`
      )
      .run(new Date(now).toISOString());
    return Number(result.changes);
  }
}
