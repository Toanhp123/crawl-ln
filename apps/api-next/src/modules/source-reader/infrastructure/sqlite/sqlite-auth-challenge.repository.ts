import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import type {
  AuthChallengeHandle,
  AuthChallengeRepository
} from '../../application/ports/auth-challenge.repository.js';
import type { SealedSecret, SecretVault } from '../../application/ports/secret-vault.port.js';
import { sealJson, unsealJson } from './encrypted-json.js';
import { sqliteUpsertUpdate } from './sqlite-syntax.js';

interface ChallengeRow {
  id: string;
  plugin_id: string;
  credential_profile_id: string | null;
  network_profile_id: string | null;
  owner_id: string | null;
  type: AuthChallengeHandle['type'];
  status: AuthChallengeHandle['status'];
  expires_at: string;
}

function toHandle(row: ChallengeRow): AuthChallengeHandle {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    ...(row.credential_profile_id ? { credentialProfileId: row.credential_profile_id } : {}),
    ...(row.network_profile_id ? { networkProfileId: row.network_profile_id } : {}),
    ...(row.owner_id ? { ownerId: row.owner_id } : {}),
    type: row.type,
    status: row.status,
    expiresAt: row.expires_at
  };
}

export class SqliteAuthChallengeRepository implements AuthChallengeRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly vault: SecretVault
  ) {}

  async save(
    input: AuthChallengeHandle & {
      encryptedState?: Record<string, unknown>;
      credentialProfileId?: string;
      networkProfileId?: string;
      ownerId?: string;
      createdAt: string;
    }
  ): Promise<void> {
    const sealed = input.encryptedState
      ? await sealJson(this.vault, input.encryptedState, {
          recordType: 'auth-challenge',
          recordId: input.id,
          ownerType: input.ownerId ? 'user' : 'system',
          ownerId: input.ownerId,
          pluginId: input.pluginId
        })
      : undefined;
    this.database.connection
      .prepare(
        `
        INSERT INTO source_reader_auth_challenges(
          id, plugin_id, credential_profile_id, network_profile_id, owner_id,
          type, status, encrypted_state, encryption_metadata_json,
          expires_at, created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) ${sqliteUpsertUpdate}
          plugin_id=excluded.plugin_id,
          credential_profile_id=excluded.credential_profile_id,
          network_profile_id=excluded.network_profile_id,
          owner_id=excluded.owner_id, type=excluded.type, status=excluded.status,
          encrypted_state=excluded.encrypted_state,
          encryption_metadata_json=excluded.encryption_metadata_json,
          expires_at=excluded.expires_at
      `
      )
      .run(
        input.id,
        input.pluginId,
        input.credentialProfileId ?? null,
        input.networkProfileId ?? null,
        input.ownerId ?? null,
        input.type,
        input.status,
        sealed?.ciphertext ?? null,
        sealed ? JSON.stringify(sealed.metadata) : null,
        input.expiresAt,
        input.createdAt
      );
  }

  async findPendingById(id: string): Promise<AuthChallengeHandle | undefined> {
    const row = this.database.connection
      .prepare(
        `SELECT id, plugin_id, credential_profile_id, network_profile_id, owner_id,
                type, status, expires_at
         FROM source_reader_auth_challenges
         WHERE id=? AND status='pending'`
      )
      .get(id) as ChallengeRow | undefined;
    return row ? toHandle(row) : undefined;
  }

  async findById(id: string): Promise<AuthChallengeHandle | undefined> {
    const row = this.database.connection
      .prepare(
        `SELECT id, plugin_id, credential_profile_id, network_profile_id, owner_id,
                type, status, expires_at
         FROM source_reader_auth_challenges WHERE id=?`
      )
      .get(id) as ChallengeRow | undefined;
    return row ? toHandle(row) : undefined;
  }

  async listPending(ownerId?: string): Promise<AuthChallengeHandle[]> {
    const rows = this.database.connection
      .prepare(
        `SELECT id, plugin_id, credential_profile_id, network_profile_id, owner_id,
                type, status, expires_at
         FROM source_reader_auth_challenges
         WHERE status='pending' AND owner_id IS ?
         ORDER BY expires_at, id`
      )
      .all(ownerId ?? null) as unknown as ChallengeRow[];
    return rows.map(toHandle);
  }

  async resolveState(handle: AuthChallengeHandle): Promise<Record<string, unknown> | undefined> {
    const row = this.database.connection
      .prepare(
        `SELECT encrypted_state, encryption_metadata_json, owner_id
                FROM source_reader_auth_challenges WHERE id=?`
      )
      .get(handle.id) as
      | {
          encrypted_state: Uint8Array | null;
          encryption_metadata_json: string | null;
          owner_id: string | null;
        }
      | undefined;
    if (!row?.encrypted_state || !row.encryption_metadata_json) return undefined;
    return unsealJson(
      this.vault,
      {
        ciphertext: row.encrypted_state,
        metadata: JSON.parse(row.encryption_metadata_json) as SealedSecret['metadata']
      },
      {
        recordType: 'auth-challenge',
        recordId: handle.id,
        ownerType: row.owner_id ? 'user' : 'system',
        ownerId: row.owner_id ?? undefined,
        pluginId: handle.pluginId
      }
    );
  }

  async complete(id: string, completedAt: string): Promise<void> {
    const result = this.database.connection
      .prepare(
        `UPDATE source_reader_auth_challenges
         SET status='completed', completed_at=? WHERE id=? AND status='pending'`
      )
      .run(completedAt, id);
    if (Number(result.changes) !== 1) throw new Error(`Challenge ${id} is no longer pending`);
  }

  async listExpiredPending(now: string): Promise<AuthChallengeHandle[]> {
    const rows = this.database.connection
      .prepare(
        `SELECT id, plugin_id, credential_profile_id, network_profile_id, owner_id,
                type, status, expires_at
         FROM source_reader_auth_challenges
         WHERE status='pending' AND expires_at<=?
         ORDER BY expires_at, id`
      )
      .all(now) as unknown as ChallengeRow[];
    return rows.map(toHandle);
  }

  async markExpired(id: string): Promise<void> {
    this.database.connection
      .prepare(
        "UPDATE source_reader_auth_challenges SET status='expired' WHERE id=? AND status='pending'"
      )
      .run(id);
  }

  async cancel(id: string, completedAt: string): Promise<void> {
    this.database.connection
      .prepare(
        `UPDATE source_reader_auth_challenges
         SET status='cancelled', completed_at=? WHERE id=? AND status='pending'`
      )
      .run(completedAt, id);
  }

  async expireBefore(now: string): Promise<number> {
    const result = this.database.connection
      .prepare(
        `UPDATE source_reader_auth_challenges SET status='expired'
                WHERE status='pending' AND expires_at <= ?`
      )
      .run(now);
    return Number(result.changes);
  }
}
