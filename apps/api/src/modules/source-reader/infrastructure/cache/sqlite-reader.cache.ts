import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import type {
  ReaderCacheEntry,
  ReaderCachePort
} from '../../application/ports/reader-cache.port.js';

export class SqliteReaderCache implements ReaderCachePort {
  constructor(private readonly database: SqliteDatabase) {}

  async get<T>(key: string): Promise<ReaderCacheEntry<T> | undefined> {
    const row = this.database.connection
      .prepare(
        `SELECT payload, expires_at, stale_until, tags_json
                FROM source_reader_cache_entries WHERE cache_key=?`
      )
      .get(key) as
      | {
          payload: Uint8Array;
          expires_at: string;
          stale_until: string | null;
          tags_json: string;
        }
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
      .prepare(
        `
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
      `
      )
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
      .all() as unknown as Array<{ cache_key: string; tags_json: string }>;
    const requested = new Set(tags);
    const remove = this.database.connection.prepare(
      'DELETE FROM source_reader_cache_entries WHERE cache_key=?'
    );
    this.database.transactionSync(() => {
      for (const row of rows) {
        const entryTags = JSON.parse(row.tags_json) as string[];
        if (entryTags.some((tag) => requested.has(tag))) remove.run(row.cache_key);
      }
    });
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
