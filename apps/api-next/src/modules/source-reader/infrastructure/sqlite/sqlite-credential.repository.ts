import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import type {
  CredentialHandle,
  CredentialRepository
} from '../../application/ports/credential.repository.js';
import type { SealedSecret, SecretVault } from '../../application/ports/secret-vault.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import { sealJson, unsealJson } from './encrypted-json.js';
import { sqliteUpsertUpdate } from './sqlite-syntax.js';

interface CredentialRow {
  id: string;
  owner_type: 'system' | 'user';
  owner_id: string | null;
  plugin_id: string | null;
  domain: string | null;
  strategy: CredentialHandle['strategy'];
}

interface CredentialMetadataRow extends CredentialRow {
  name: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function toHandle(row: CredentialRow): CredentialHandle {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ...(row.owner_id ? { ownerId: row.owner_id } : {}),
    ...(row.plugin_id ? { pluginId: row.plugin_id } : {}),
    ...(row.domain ? { domain: row.domain } : {}),
    strategy: row.strategy
  };
}

export class SqliteCredentialRepository implements CredentialRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly vault: SecretVault
  ) {}

  async save(
    input: CredentialHandle & {
      name: string;
      secret: Record<string, unknown>;
      enabled: boolean;
      createdAt: string;
      updatedAt: string;
    }
  ): Promise<void> {
    const sealed = await sealJson(this.vault, input.secret, {
      recordType: 'credential',
      recordId: input.id,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      pluginId: input.pluginId
    });
    this.database.connection
      .prepare(
        `
        INSERT INTO source_reader_credentials(
          id, owner_type, owner_id, plugin_id, domain, name, strategy,
          encrypted_payload, encryption_metadata_json, enabled, created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) ${sqliteUpsertUpdate}
          owner_type=excluded.owner_type, owner_id=excluded.owner_id,
          plugin_id=excluded.plugin_id, domain=excluded.domain, name=excluded.name,
          strategy=excluded.strategy, encrypted_payload=excluded.encrypted_payload,
          encryption_metadata_json=excluded.encryption_metadata_json,
          enabled=excluded.enabled, updated_at=excluded.updated_at
      `
      )
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
      .prepare(
        `SELECT id, owner_type, owner_id, plugin_id, domain, strategy
                FROM source_reader_credentials WHERE id=? AND enabled=1`
      )
      .get(id) as CredentialRow | undefined;
    return row ? toHandle(row) : undefined;
  }

  async findCandidates(input: {
    userId?: string;
    pluginId: string;
    domain: string;
  }): Promise<CredentialHandle[]> {
    const rows = this.database.connection
      .prepare(
        `
        SELECT id, owner_type, owner_id, plugin_id, domain, strategy
        FROM source_reader_credentials
        WHERE enabled=1
          AND (plugin_id=? OR plugin_id IS NULL)
          AND (domain=? OR domain IS NULL)
          AND ((owner_type='user' AND owner_id=?) OR owner_type='system')
        ORDER BY CASE WHEN owner_type='user' THEN 0 ELSE 1 END,
                 CASE WHEN plugin_id IS NOT NULL THEN 0 ELSE 1 END,
                 CASE WHEN domain IS NOT NULL THEN 0 ELSE 1 END,
                 updated_at DESC
      `
      )
      .all(input.pluginId, input.domain, input.userId ?? null) as unknown as CredentialRow[];
    return rows.map(toHandle);
  }

  async resolveSecret(handle: CredentialHandle): Promise<Record<string, unknown>> {
    const row = this.database.connection
      .prepare(
        `SELECT encrypted_payload, encryption_metadata_json
                FROM source_reader_credentials WHERE id=? AND enabled=1`
      )
      .get(handle.id) as
      { encrypted_payload: Uint8Array; encryption_metadata_json: string } | undefined;
    if (!row) throw new Error(`Credential ${handle.id} is unavailable`);
    return unsealJson(
      this.vault,
      {
        ciphertext: row.encrypted_payload,
        metadata: JSON.parse(row.encryption_metadata_json) as SealedSecret['metadata']
      },
      {
        recordType: 'credential',
        recordId: handle.id,
        ownerType: handle.ownerType,
        ownerId: handle.ownerId,
        pluginId: handle.pluginId
      }
    );
  }

  async listMetadata(input: { ownerId?: string; includeSystem: boolean }) {
    const rows = this.database.connection
      .prepare(
        `SELECT id, owner_type, owner_id, plugin_id, domain, name, strategy,
                enabled, created_at, updated_at
         FROM source_reader_credentials
         WHERE (owner_type='user' AND owner_id=?)
            OR (?=1 AND owner_type='system')
         ORDER BY owner_type DESC, name, id`
      )
      .all(
        input.ownerId ?? null,
        input.includeSystem ? 1 : 0
      ) as unknown as CredentialMetadataRow[];
    return rows.map((row) => ({
      ...toHandle(row),
      name: row.name,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async requireHandle(id: string): Promise<CredentialHandle> {
    const handle = await this.findHandleById(id);
    if (!handle) {
      throw new SourceReaderError('CREDENTIAL_UNAVAILABLE', 'Credential is unavailable', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    return handle;
  }

  async updateSecret(
    id: string,
    secret: Record<string, unknown>,
    updatedAt: string
  ): Promise<void> {
    const handle = await this.requireHandle(id);
    const sealed = await sealJson(this.vault, secret, {
      recordType: 'credential',
      recordId: id,
      ownerType: handle.ownerType,
      ownerId: handle.ownerId,
      pluginId: handle.pluginId
    });
    this.database.connection
      .prepare(
        `UPDATE source_reader_credentials
         SET encrypted_payload=?, encryption_metadata_json=?, updated_at=?
         WHERE id=? AND enabled=1`
      )
      .run(sealed.ciphertext, JSON.stringify(sealed.metadata), updatedAt, id);
  }

  async delete(id: string): Promise<void> {
    this.database.transactionSync(() => {
      this.database.connection
        .prepare("UPDATE source_reader_sessions SET status='revoked' WHERE credential_profile_id=?")
        .run(id);
      this.database.connection.prepare('DELETE FROM source_reader_credentials WHERE id=?').run(id);
    });
  }
}
