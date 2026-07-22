import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import type {
  SessionHandle,
  SessionRepository
} from '../../application/ports/session.repository.js';
import type { SourceReaderInvalidationEvent } from '../../application/ports/source-reader-invalidation.port.js';
import type { SealedSecret, SecretVault } from '../../application/ports/secret-vault.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import { sealJson, unsealJson } from './encrypted-json.js';
import { sqliteUpsertUpdate } from './sqlite-syntax.js';

interface SessionRow {
  id: string;
  plugin_id: string;
  plugin_version: string;
  credential_profile_id: string;
  owner_id: string | null;
  network_profile_id: string | null;
  network_binding: SessionHandle['networkBinding'];
  expires_at: string | null;
}

function toHandle(row: SessionRow): SessionHandle {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    pluginVersion: row.plugin_version,
    credentialProfileId: row.credential_profile_id,
    ...(row.owner_id ? { ownerId: row.owner_id } : {}),
    ...(row.network_profile_id ? { networkProfileId: row.network_profile_id } : {}),
    networkBinding: row.network_binding,
    ...(row.expires_at ? { expiresAt: row.expires_at } : {})
  };
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly vault: SecretVault
  ) {}

  async save(
    input: SessionHandle & {
      encryptedMaterial: Record<string, unknown>;
      status: 'active' | 'expired' | 'revoked';
      createdAt: string;
    }
  ): Promise<void> {
    const ownerType = input.ownerId ? 'user' : 'system';
    const sealed = await sealJson(this.vault, input.encryptedMaterial, {
      recordType: 'session',
      recordId: input.id,
      ownerType,
      ownerId: input.ownerId,
      pluginId: input.pluginId
    });
    this.database.connection
      .prepare(
        `
        INSERT INTO source_reader_sessions(
          id, plugin_id, plugin_version, credential_profile_id, owner_type, owner_id,
          network_profile_id, network_binding, encrypted_session,
          encryption_metadata_json, status, expires_at, created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) ${sqliteUpsertUpdate}
          plugin_id=excluded.plugin_id, plugin_version=excluded.plugin_version,
          credential_profile_id=excluded.credential_profile_id,
          owner_type=excluded.owner_type, owner_id=excluded.owner_id,
          network_profile_id=excluded.network_profile_id,
          network_binding=excluded.network_binding,
          encrypted_session=excluded.encrypted_session,
          encryption_metadata_json=excluded.encryption_metadata_json,
          status=excluded.status, expires_at=excluded.expires_at
      `
      )
      .run(
        input.id,
        input.pluginId,
        input.pluginVersion,
        input.credentialProfileId,
        ownerType,
        input.ownerId ?? null,
        input.networkProfileId ?? null,
        input.networkBinding,
        sealed.ciphertext,
        JSON.stringify(sealed.metadata),
        input.status,
        input.expiresAt ?? null,
        input.createdAt
      );
  }

  async findActive(input: {
    pluginId: string;
    pluginVersion: string;
    credentialProfileId: string;
    ownerId?: string;
    networkProfileId?: string;
  }): Promise<SessionHandle | undefined> {
    const exact = this.findActiveRow({
      ...input,
      networkProfileId: input.networkProfileId
    });
    if (exact) return toHandle(exact);

    const alternate = this.findActiveRow(
      {
        pluginId: input.pluginId,
        pluginVersion: input.pluginVersion,
        credentialProfileId: input.credentialProfileId,
        ownerId: input.ownerId
      },
      false
    );
    if (!alternate) return undefined;
    const handle = toHandle(alternate);
    if (handle.networkBinding !== 'required') return undefined;
    throw new SourceReaderError(
      'SESSION_BINDING_MISMATCH',
      'Session is bound to a different network route',
      {
        retryable: false,
        fallbackAllowed: false,
        details: {
          sessionId: handle.id,
          expectedNetworkProfileId: handle.networkProfileId ?? 'direct',
          requestedNetworkProfileId: input.networkProfileId ?? 'direct'
        }
      }
    );
  }

  private findActiveRow(
    input: {
      pluginId: string;
      pluginVersion: string;
      credentialProfileId: string;
      ownerId?: string;
      networkProfileId?: string;
    },
    matchNetwork = true
  ): SessionRow | undefined {
    const networkClause = matchNetwork ? 'AND network_profile_id IS ?' : '';
    const statement = this.database.connection.prepare(
      `
        SELECT id, plugin_id, plugin_version, credential_profile_id, owner_id,
               network_profile_id, network_binding, expires_at
        FROM source_reader_sessions
        WHERE plugin_id=? AND plugin_version=? AND credential_profile_id=?
          AND owner_id IS ? ${networkClause}
          AND status='active'
          AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ORDER BY COALESCE(last_used_at, created_at) DESC
        LIMIT 1
      `
    );
    const parameters = [
      input.pluginId,
      input.pluginVersion,
      input.credentialProfileId,
      input.ownerId ?? null,
      ...(matchNetwork ? [input.networkProfileId ?? null] : [])
    ];
    return statement.get(...parameters) as SessionRow | undefined;
  }

  async resolveMaterial(handle: SessionHandle): Promise<Record<string, unknown>> {
    const row = this.database.connection
      .prepare(
        `SELECT encrypted_session, encryption_metadata_json, owner_type
                FROM source_reader_sessions WHERE id=? AND status='active'`
      )
      .get(handle.id) as
      | {
          encrypted_session: Uint8Array;
          encryption_metadata_json: string;
          owner_type: 'system' | 'user';
        }
      | undefined;
    if (!row) throw new Error(`Session ${handle.id} is unavailable`);
    return unsealJson(
      this.vault,
      {
        ciphertext: row.encrypted_session,
        metadata: JSON.parse(row.encryption_metadata_json) as SealedSecret['metadata']
      },
      {
        recordType: 'session',
        recordId: handle.id,
        ownerType: row.owner_type,
        ownerId: handle.ownerId,
        pluginId: handle.pluginId
      }
    );
  }

  async revokeByCredential(credentialProfileId: string): Promise<void> {
    this.database.connection
      .prepare("UPDATE source_reader_sessions SET status='revoked' WHERE credential_profile_id=?")
      .run(credentialProfileId);
  }

  async revokeByNetworkProfile(networkProfileId: string): Promise<void> {
    this.database.connection
      .prepare("UPDATE source_reader_sessions SET status='revoked' WHERE network_profile_id=?")
      .run(networkProfileId);
  }

  async revokeMatching(event: SourceReaderInvalidationEvent): Promise<number> {
    let sql: string | undefined;
    let parameters: string[] = [];
    switch (event.type) {
      case 'credential-updated':
      case 'credential-deleted':
      case 'logout':
        sql =
          "UPDATE source_reader_sessions SET status='revoked' WHERE credential_profile_id=? AND status='active'";
        parameters = [event.credentialId];
        break;
      case 'session-revoked':
        sql = "UPDATE source_reader_sessions SET status='revoked' WHERE id=? AND status='active'";
        parameters = [event.sessionId];
        break;
      case 'network-profile-updated':
      case 'network-profile-deleted':
        sql =
          "UPDATE source_reader_sessions SET status='revoked' WHERE network_profile_id=? AND status='active'";
        parameters = [event.networkIdentity];
        break;
      case 'plugin-activated':
      case 'plugin-upgraded':
      case 'plugin-disabled':
      case 'plugin-quarantined':
        sql = event.pluginVersion
          ? "UPDATE source_reader_sessions SET status='revoked' WHERE plugin_id=? AND plugin_version=? AND status='active'"
          : "UPDATE source_reader_sessions SET status='revoked' WHERE plugin_id=? AND status='active'";
        parameters = event.pluginVersion ? [event.pluginId, event.pluginVersion] : [event.pluginId];
        break;
      case 'chapter-list-version-changed':
        return 0;
    }
    const result = this.database.connection.prepare(sql).run(...parameters);
    return Number(result.changes);
  }

  async expireBefore(now: string): Promise<number> {
    const result = this.database.connection
      .prepare(
        `UPDATE source_reader_sessions SET status='expired'
                WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= ?`
      )
      .run(now);
    return Number(result.changes);
  }
}
