import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import type {
  NetworkProfileHandle,
  NetworkProfileRepository
} from '../../application/ports/network-profile.repository.js';
import type { SealedSecret, SecretVault } from '../../application/ports/secret-vault.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import { sealJson, unsealJson } from './encrypted-json.js';

interface NetworkRow {
  id: string;
  owner_type: 'system' | 'user';
  owner_id: string | null;
  route_type: NetworkProfileHandle['routeType'];
  regions_json: string;
  tags_json: string;
  health_status: NetworkProfileHandle['healthStatus'];
}

interface NetworkMetadataRow extends NetworkRow {
  name: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function toHandle(row: NetworkRow): NetworkProfileHandle {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ...(row.owner_id ? { ownerId: row.owner_id } : {}),
    routeType: row.route_type,
    regions: JSON.parse(row.regions_json) as string[],
    tags: JSON.parse(row.tags_json) as string[],
    healthStatus: row.health_status
  };
}

function intersects(values: string[], requested?: string[]): boolean {
  return !requested?.length || requested.some((value) => values.includes(value));
}

export class SqliteNetworkProfileRepository implements NetworkProfileRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly vault: SecretVault
  ) {}

  async save(
    input: NetworkProfileHandle & {
      name: string;
      secretConfig?: Record<string, unknown>;
      enabled?: boolean;
      createdAt?: string;
      updatedAt?: string;
    }
  ): Promise<void> {
    const now = input.updatedAt ?? input.createdAt ?? new Date().toISOString();
    const sealed = input.secretConfig
      ? await sealJson(this.vault, input.secretConfig, {
          recordType: 'network-profile',
          recordId: input.id,
          ownerType: input.ownerType,
          ownerId: input.ownerId
        })
      : undefined;
    this.database.connection
      .prepare(
        `
        INSERT INTO source_reader_network_profiles(
          id, owner_type, owner_id, name, route_type, regions_json, tags_json,
          encrypted_config, encryption_metadata_json, enabled, health_status,
          created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          owner_type=excluded.owner_type, owner_id=excluded.owner_id,
          name=excluded.name, route_type=excluded.route_type,
          regions_json=excluded.regions_json, tags_json=excluded.tags_json,
          encrypted_config=excluded.encrypted_config,
          encryption_metadata_json=excluded.encryption_metadata_json,
          enabled=excluded.enabled, health_status=excluded.health_status,
          updated_at=excluded.updated_at
      `
      )
      .run(
        input.id,
        input.ownerType,
        input.ownerId ?? null,
        input.name,
        input.routeType,
        JSON.stringify(input.regions),
        JSON.stringify(input.tags),
        sealed?.ciphertext ?? null,
        sealed ? JSON.stringify(sealed.metadata) : null,
        input.enabled === false ? 0 : 1,
        input.healthStatus,
        input.createdAt ?? now,
        now
      );
  }

  async findHandleById(id: string): Promise<NetworkProfileHandle | undefined> {
    const row = this.database.connection
      .prepare(
        `SELECT id, owner_type, owner_id, route_type, regions_json, tags_json, health_status
                FROM source_reader_network_profiles WHERE id=? AND enabled=1`
      )
      .get(id) as NetworkRow | undefined;
    return row ? toHandle(row) : undefined;
  }

  async findCandidates(input: {
    userId?: string;
    regions?: string[];
    tags?: string[];
  }): Promise<NetworkProfileHandle[]> {
    const rows = this.database.connection
      .prepare(
        `
        SELECT id, owner_type, owner_id, route_type, regions_json, tags_json, health_status
        FROM source_reader_network_profiles
        WHERE enabled=1
          AND health_status IN ('unknown','healthy','degraded')
          AND ((owner_type='user' AND owner_id=?) OR owner_type='system')
        ORDER BY CASE WHEN owner_type='user' THEN 0 ELSE 1 END, updated_at DESC
      `
      )
      .all(input.userId ?? null) as unknown as NetworkRow[];
    return rows
      .map(toHandle)
      .filter(
        (handle) => intersects(handle.regions, input.regions) && intersects(handle.tags, input.tags)
      );
  }

  async resolveConfig(handle: NetworkProfileHandle): Promise<Record<string, unknown> | undefined> {
    const row = this.database.connection
      .prepare(
        `SELECT encrypted_config, encryption_metadata_json
                FROM source_reader_network_profiles WHERE id=?`
      )
      .get(handle.id) as
      { encrypted_config: Uint8Array | null; encryption_metadata_json: string | null } | undefined;
    if (!row?.encrypted_config || !row.encryption_metadata_json) return undefined;
    return unsealJson(
      this.vault,
      {
        ciphertext: row.encrypted_config,
        metadata: JSON.parse(row.encryption_metadata_json) as SealedSecret['metadata']
      },
      {
        recordType: 'network-profile',
        recordId: handle.id,
        ownerType: handle.ownerType,
        ownerId: handle.ownerId
      }
    );
  }

  async listMetadata(input: { ownerId?: string; includeSystem: boolean }) {
    const rows = this.database.connection
      .prepare(
        `SELECT id, owner_type, owner_id, name, route_type, regions_json, tags_json,
                health_status, enabled, created_at, updated_at
         FROM source_reader_network_profiles
         WHERE (owner_type='user' AND owner_id=?)
            OR (?=1 AND owner_type='system')
         ORDER BY owner_type DESC, name, id`
      )
      .all(input.ownerId ?? null, input.includeSystem ? 1 : 0) as unknown as NetworkMetadataRow[];
    return rows.map((row) => ({
      ...toHandle(row),
      name: row.name,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async requireHandle(id: string): Promise<NetworkProfileHandle> {
    const handle = await this.findHandleById(id);
    if (!handle) {
      throw new SourceReaderError('NETWORK_ROUTE_OFFLINE', 'Network profile is unavailable', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    return handle;
  }

  async requireStoredHandle(id: string): Promise<NetworkProfileHandle> {
    const row = this.database.connection
      .prepare(
        `SELECT id, owner_type, owner_id, route_type, regions_json, tags_json, health_status
         FROM source_reader_network_profiles WHERE id=?`
      )
      .get(id) as NetworkRow | undefined;
    if (!row) {
      throw new SourceReaderError('NETWORK_ROUTE_OFFLINE', 'Network profile is unavailable', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    return toHandle(row);
  }

  async update(
    id: string,
    patch: Partial<{
      name: string;
      routeType: NetworkProfileHandle['routeType'];
      regions: string[];
      tags: string[];
      config: Record<string, unknown>;
      enabled: boolean;
    }>,
    updatedAt: string
  ): Promise<void> {
    const handle = await this.requireStoredHandle(id);
    const row = this.database.connection
      .prepare(`SELECT name, enabled, created_at FROM source_reader_network_profiles WHERE id=?`)
      .get(id) as { name: string; enabled: number; created_at: string } | undefined;
    if (!row) return;
    const currentConfig =
      patch.config === undefined ? await this.resolveConfig(handle) : patch.config;
    await this.save({
      ...handle,
      name: patch.name ?? row.name,
      routeType: patch.routeType ?? handle.routeType,
      regions: patch.regions ?? handle.regions,
      tags: patch.tags ?? handle.tags,
      ...(currentConfig ? { secretConfig: currentConfig } : {}),
      enabled: patch.enabled ?? row.enabled === 1,
      createdAt: row.created_at,
      updatedAt
    });
  }

  async setHealth(
    id: string,
    status: NetworkProfileHandle['healthStatus'],
    checkedAt: string
  ): Promise<void> {
    this.database.connection
      .prepare(
        `UPDATE source_reader_network_profiles
         SET health_status=?, last_health_check_at=?, updated_at=?
         WHERE id=?`
      )
      .run(status, checkedAt, checkedAt, id);
  }

  async delete(id: string): Promise<void> {
    this.database.transactionSync(() => {
      this.database.connection
        .prepare("UPDATE source_reader_sessions SET status='revoked' WHERE network_profile_id=?")
        .run(id);
      this.database.connection
        .prepare('DELETE FROM source_reader_network_profiles WHERE id=?')
        .run(id);
    });
  }
}
