import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import type {
  PluginStorePort,
  StoredPluginVersion
} from '../../application/ports/plugin-store.port.js';
import type { PluginStatus, PluginTrustLevel } from '../../domain/plugin/source-plugin.js';
import type { CompatibilityIssue } from '../../domain/plugin/source-reader-host-compatibility.js';
import { parseSourcePluginManifest } from '../../domain/plugin/source-plugin-manifest.schema.js';

interface StoredVersionRow {
  plugin_id: string;
  version: string;
  trust_level: PluginTrustLevel;
  status: PluginStatus;
  package_path: string;
  checksum: string;
  signature_status: StoredPluginVersion['signatureStatus'];
  manifest_json: string;
  compatibility_issues_json: string;
  activated_extensions_json: string;
  sandbox_protocol_version: number | null;
}

function storedVersion(row: StoredVersionRow): StoredPluginVersion {
  return {
    pluginId: row.plugin_id,
    version: row.version,
    trustLevel: row.trust_level,
    status: row.status,
    packagePath: row.package_path,
    checksum: row.checksum,
    signatureStatus: row.signature_status,
    manifest: parseSourcePluginManifest(JSON.parse(row.manifest_json) as unknown),
    compatibilityIssues: JSON.parse(row.compatibility_issues_json) as CompatibilityIssue[],
    activatedExtensions: JSON.parse(row.activated_extensions_json) as Record<
      string,
      { version: number; schema: string; required: boolean }
    >,
    ...(row.sandbox_protocol_version === null
      ? {}
      : { sandboxProtocolVersion: row.sandbox_protocol_version })
  };
}

export class SqlitePluginStore implements PluginStorePort {
  constructor(private readonly database: SqliteDatabase) {}

  async recordInstallation(input: Parameters<PluginStorePort['recordInstallation']>[0]) {
    this.database.connection
      .prepare(
        `
        INSERT INTO source_reader_installations(
          id, plugin_id, plugin_version, original_package_path, staging_path,
          status, error_code, created_at, completed_at
        ) VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          plugin_id=excluded.plugin_id,
          plugin_version=excluded.plugin_version,
          original_package_path=excluded.original_package_path,
          staging_path=excluded.staging_path,
          status=excluded.status,
          error_code=excluded.error_code,
          completed_at=excluded.completed_at
      `
      )
      .run(
        input.id,
        input.pluginId ?? null,
        input.pluginVersion ?? null,
        input.originalPackagePath,
        input.stagingPath ?? null,
        input.status,
        input.errorCode ?? null,
        input.createdAt,
        input.completedAt ?? null
      );
  }

  async upsertPluginVersion(input: Parameters<PluginStorePort['upsertPluginVersion']>[0]) {
    this.database.transactionSync(() => {
      this.database.connection
        .prepare(
          `
          INSERT INTO source_reader_plugins(
            id, name, trust_level, status, active_version, enabled, installed_at, updated_at
          ) VALUES(?,?,?,?,NULL,0,?,?)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            trust_level=CASE
              WHEN source_reader_plugins.active_version IS NULL THEN excluded.trust_level
              ELSE source_reader_plugins.trust_level
            END,
            status=CASE
              WHEN source_reader_plugins.active_version IS NULL THEN excluded.status
              ELSE source_reader_plugins.status
            END,
            updated_at=excluded.updated_at
        `
        )
        .run(
          input.pluginId,
          input.name,
          input.trustLevel,
          input.status,
          input.installedAt,
          input.installedAt
        );
      this.database.connection
        .prepare(
          `
          INSERT INTO source_reader_plugin_versions(
            plugin_id, version, trust_level, status, package_path, checksum,
            signature_status, manifest_json, sdk_range, installed_at,
            compatibility_issues_json, activated_extensions_json, sandbox_protocol_version
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(plugin_id, version) DO UPDATE SET
            trust_level=excluded.trust_level,
            status=CASE
              WHEN source_reader_plugin_versions.status='active' THEN 'active'
              ELSE excluded.status
            END,
            package_path=excluded.package_path,
            checksum=excluded.checksum,
            signature_status=excluded.signature_status,
            manifest_json=excluded.manifest_json,
            sdk_range=excluded.sdk_range,
            compatibility_issues_json=excluded.compatibility_issues_json,
            activated_extensions_json=excluded.activated_extensions_json,
            sandbox_protocol_version=excluded.sandbox_protocol_version
        `
        )
        .run(
          input.pluginId,
          input.version,
          input.trustLevel,
          input.status,
          input.packagePath,
          input.checksum,
          input.signatureStatus,
          input.manifestJson,
          input.sdkRange,
          input.installedAt,
          input.compatibilityIssuesJson ?? '[]',
          input.activatedExtensionsJson ?? '{}',
          input.sandboxProtocolVersion ?? null
        );
    });
  }

  async replaceRequestedPermissions(
    input: Parameters<PluginStorePort['replaceRequestedPermissions']>[0]
  ) {
    this.database.transactionSync(() => {
      this.database.connection
        .prepare(
          'DELETE FROM source_reader_plugin_permissions WHERE plugin_id=? AND plugin_version=?'
        )
        .run(input.pluginId, input.pluginVersion);
      const insert = this.database.connection.prepare(
        `INSERT INTO source_reader_plugin_permissions(
          plugin_id, plugin_version, permission, scope_json, status
        ) VALUES(?,?,?,?, 'pending')`
      );
      for (const permission of input.permissions) {
        insert.run(
          input.pluginId,
          input.pluginVersion,
          permission.permission,
          permission.scopeJson
        );
      }
    });
  }

  async approvePermissions(input: Parameters<PluginStorePort['approvePermissions']>[0]) {
    this.database.connection
      .prepare(
        `UPDATE source_reader_plugin_permissions
         SET status='approved', approved_by=?, approved_at=?
         WHERE plugin_id=? AND plugin_version=?`
      )
      .run(input.approvedBy, input.approvedAt, input.pluginId, input.pluginVersion);
  }

  async permissionsApproved(pluginId: string, version: string): Promise<boolean> {
    const row = this.database.connection
      .prepare(
        `SELECT COUNT(*) AS pending
         FROM source_reader_plugin_permissions
         WHERE plugin_id=? AND plugin_version=? AND status!='approved'`
      )
      .get(pluginId, version) as { pending: number };
    return Number(row.pending) === 0;
  }

  async activate(pluginId: string, version: string, activatedAt: string): Promise<void> {
    await this.activateCandidateAtomically(pluginId, version, activatedAt);
  }

  async activateCandidateAtomically(
    pluginId: string,
    version: string,
    activatedAt: string
  ): Promise<void> {
    this.database.transactionSync(() => {
      const candidate = this.database.connection
        .prepare(
          `SELECT trust_level, status
           FROM source_reader_plugin_versions WHERE plugin_id=? AND version=?`
        )
        .get(pluginId, version) as
        { trust_level: PluginTrustLevel; status: PluginStatus } | undefined;
      if (!candidate) throw new Error(`Plugin version ${pluginId}@${version} does not exist`);
      if (candidate.status === 'quarantined' || candidate.status === 'failed') {
        throw new Error(`Plugin version ${pluginId}@${version} is not activatable`);
      }
      const approval = this.database.connection
        .prepare(
          `SELECT COUNT(*) AS pending
           FROM source_reader_plugin_permissions
           WHERE plugin_id=? AND plugin_version=? AND status!='approved'`
        )
        .get(pluginId, version) as { pending: number };
      if (Number(approval.pending) > 0) throw new Error('Plugin permissions are not approved');

      const plugin = this.database.connection
        .prepare('SELECT active_version FROM source_reader_plugins WHERE id=?')
        .get(pluginId) as { active_version: string | null } | undefined;
      if (!plugin) throw new Error(`Plugin ${pluginId} does not exist`);
      if (plugin.active_version && plugin.active_version !== version) {
        this.database.connection
          .prepare(
            `UPDATE source_reader_plugin_versions SET status='installed'
             WHERE plugin_id=? AND version=? AND status='active'`
          )
          .run(pluginId, plugin.active_version);
      }

      const pluginUpdate = this.database.connection
        .prepare(
          `UPDATE source_reader_plugins
           SET active_version=?, trust_level=?, status='active', enabled=1, updated_at=?
           WHERE id=?`
        )
        .run(version, candidate.trust_level, activatedAt, pluginId);
      if (Number(pluginUpdate.changes) !== 1)
        throw new Error(`Plugin ${pluginId} activation failed`);

      const versionUpdate = this.database.connection
        .prepare(
          `UPDATE source_reader_plugin_versions
           SET status='active', activated_at=?
           WHERE plugin_id=? AND version=?`
        )
        .run(activatedAt, pluginId, version);
      if (Number(versionUpdate.changes) !== 1) {
        throw new Error(`Plugin version ${pluginId}@${version} activation failed`);
      }
    });
  }

  async restoreActivation(
    pluginId: string,
    previousVersion: string | undefined,
    restoredAt: string
  ): Promise<void> {
    this.database.transactionSync(() => {
      this.database.connection
        .prepare(
          `UPDATE source_reader_plugin_versions
           SET status='installed', activated_at=NULL
           WHERE plugin_id=? AND status IN ('active','initializing')`
        )
        .run(pluginId);

      if (!previousVersion) {
        this.database.connection
          .prepare(
            `UPDATE source_reader_plugins
             SET active_version=NULL, enabled=0, status='disabled', updated_at=?
             WHERE id=?`
          )
          .run(restoredAt, pluginId);
        return;
      }

      const previous = this.database.connection
        .prepare(
          `SELECT trust_level FROM source_reader_plugin_versions
           WHERE plugin_id=? AND version=?`
        )
        .get(pluginId, previousVersion) as { trust_level: PluginTrustLevel } | undefined;
      if (!previous) {
        throw new Error(`Plugin version ${pluginId}@${previousVersion} does not exist`);
      }

      const versionUpdate = this.database.connection
        .prepare(
          `UPDATE source_reader_plugin_versions
           SET status='active', activated_at=?, quarantine_reason=NULL
           WHERE plugin_id=? AND version=?`
        )
        .run(restoredAt, pluginId, previousVersion);
      if (Number(versionUpdate.changes) !== 1) {
        throw new Error(`Plugin version ${pluginId}@${previousVersion} restore failed`);
      }

      const pluginUpdate = this.database.connection
        .prepare(
          `UPDATE source_reader_plugins
           SET active_version=?, trust_level=?, status='active', enabled=1, updated_at=?
           WHERE id=?`
        )
        .run(previousVersion, previous.trust_level, restoredAt, pluginId);
      if (Number(pluginUpdate.changes) !== 1) {
        throw new Error(`Plugin ${pluginId} restore failed`);
      }
    });
  }

  async recordActivationFailure(input: {
    pluginId: string;
    version: string;
    phase: string;
    message: string;
  }): Promise<void> {
    this.database.connection
      .prepare(
        `UPDATE source_reader_plugin_versions
         SET quarantine_reason=?
         WHERE plugin_id=? AND version=?`
      )
      .run(`${input.phase}: ${input.message}`.slice(0, 1000), input.pluginId, input.version);
  }

  async findVersion(pluginId: string, version: string): Promise<StoredPluginVersion | undefined> {
    const row = this.database.connection
      .prepare(
        `SELECT plugin_id, version, trust_level, status, package_path,
                checksum, signature_status, manifest_json, compatibility_issues_json,
                activated_extensions_json, sandbox_protocol_version
         FROM source_reader_plugin_versions
         WHERE plugin_id=? AND version=?`
      )
      .get(pluginId, version) as StoredVersionRow | undefined;
    return row ? storedVersion(row) : undefined;
  }

  async findLatestVersion(pluginId: string): Promise<StoredPluginVersion | undefined> {
    const row = this.database.connection
      .prepare(
        `SELECT plugin_id, version, trust_level, status, package_path,
                checksum, signature_status, manifest_json, compatibility_issues_json,
                activated_extensions_json, sandbox_protocol_version
         FROM source_reader_plugin_versions
         WHERE plugin_id=?
         ORDER BY installed_at DESC, version DESC
         LIMIT 1`
      )
      .get(pluginId) as StoredVersionRow | undefined;
    return row ? storedVersion(row) : undefined;
  }

  async findActive(pluginId: string): Promise<StoredPluginVersion | undefined> {
    const row = this.database.connection
      .prepare(
        `SELECT v.plugin_id, v.version, v.trust_level, v.status, v.package_path,
                v.checksum, v.signature_status, v.manifest_json,
                v.compatibility_issues_json, v.activated_extensions_json,
                v.sandbox_protocol_version
         FROM source_reader_plugins p
         JOIN source_reader_plugin_versions v
           ON v.plugin_id=p.id AND v.version=p.active_version
         WHERE p.id=? AND p.enabled=1 AND p.status='active' AND v.status='active'`
      )
      .get(pluginId) as StoredVersionRow | undefined;
    return row ? storedVersion(row) : undefined;
  }

  async listActive(): Promise<StoredPluginVersion[]> {
    const rows = this.database.connection
      .prepare(
        `SELECT v.plugin_id, v.version, v.trust_level, v.status, v.package_path,
                v.checksum, v.signature_status, v.manifest_json,
                v.compatibility_issues_json, v.activated_extensions_json,
                v.sandbox_protocol_version
         FROM source_reader_plugins p
         JOIN source_reader_plugin_versions v
           ON v.plugin_id=p.id AND v.version=p.active_version
         WHERE p.enabled=1 AND p.status='active' AND v.status='active'
           AND v.package_path IS NOT NULL
         ORDER BY p.id`
      )
      .all() as unknown as StoredVersionRow[];
    return rows.map(storedVersion);
  }

  async listPendingRevalidation(): Promise<StoredPluginVersion[]> {
    const rows = this.database.connection
      .prepare(
        `SELECT v.plugin_id, v.version, v.trust_level, v.status, v.package_path,
                v.checksum, v.signature_status, v.manifest_json,
                v.compatibility_issues_json, v.activated_extensions_json,
                v.sandbox_protocol_version
         FROM source_reader_plugin_versions v
         JOIN source_reader_plugins p ON p.id=v.plugin_id
         WHERE v.status='installed-pending-revalidation'
           AND v.trust_level!='built-in'
           AND p.status='installed-pending-revalidation'
         ORDER BY v.plugin_id, v.version`
      )
      .all() as unknown as StoredVersionRow[];
    return rows.map(storedVersion);
  }

  async listInstalled() {
    const rows = this.database.connection
      .prepare(
        `WITH descriptors AS (
           SELECT p.*,
             COALESCE(
               p.active_version,
               (SELECT version
                FROM source_reader_plugin_versions candidate
                WHERE candidate.plugin_id=p.id
                ORDER BY candidate.installed_at DESC, candidate.version DESC
                LIMIT 1)
             ) AS descriptor_version
           FROM source_reader_plugins p
         )
         SELECT d.id, d.name, d.trust_level, d.status, d.active_version,
                d.enabled, d.installed_at, d.updated_at, d.descriptor_version,
                v.manifest_json,
                EXISTS(
                  SELECT 1 FROM source_reader_plugin_permissions permission
                  WHERE permission.plugin_id=d.id
                    AND permission.plugin_version=d.descriptor_version
                    AND permission.status!='approved'
                ) AS permissions_pending,
                (SELECT health.status
                 FROM source_reader_health_checks health
                 WHERE health.plugin_id=d.id
                   AND health.plugin_version=d.descriptor_version
                 ORDER BY health.checked_at DESC LIMIT 1) AS health_status,
                (SELECT health.checked_at
                 FROM source_reader_health_checks health
                 WHERE health.plugin_id=d.id
                   AND health.plugin_version=d.descriptor_version
                 ORDER BY health.checked_at DESC LIMIT 1) AS health_checked_at
         FROM descriptors d
         LEFT JOIN source_reader_plugin_versions v
           ON v.plugin_id=d.id AND v.version=d.descriptor_version
         ORDER BY d.id`
      )
      .all() as unknown as Array<{
      id: string;
      name: string;
      trust_level: PluginTrustLevel;
      status: PluginStatus;
      active_version: string | null;
      enabled: number;
      installed_at: string;
      updated_at: string;
      descriptor_version: string | null;
      manifest_json: string | null;
      permissions_pending: number;
      health_status: 'healthy' | 'degraded' | 'failed' | null;
      health_checked_at: string | null;
    }>;
    return rows.map((row) => {
      const manifest = row.manifest_json
        ? parseSourcePluginManifest(JSON.parse(row.manifest_json) as unknown)
        : undefined;
      const domains = Array.from(
        new Set(manifest?.matchers.flatMap((matcher) => matcher.hosts) ?? [])
      );
      return {
        pluginId: row.id,
        name: row.name,
        trustLevel: row.trust_level,
        status: row.status,
        ...(row.active_version ? { activeVersion: row.active_version } : {}),
        enabled: row.enabled === 1,
        capabilities: manifest?.capabilities ?? [],
        domains,
        permissionsPending: row.permissions_pending === 1,
        ...(row.health_status
          ? {
              health: {
                status: row.health_status,
                ...(row.health_checked_at ? { lastCheckedAt: row.health_checked_at } : {})
              }
            }
          : {}),
        installedAt: row.installed_at,
        updatedAt: row.updated_at
      };
    });
  }

  async listPermissions(pluginId: string) {
    const rows = this.database.connection
      .prepare(
        `SELECT plugin_id, plugin_version, permission, scope_json, status,
                approved_by, approved_at
         FROM source_reader_plugin_permissions WHERE plugin_id=?
         ORDER BY plugin_version, permission, scope_json`
      )
      .all(pluginId) as unknown as Array<{
      plugin_id: string;
      plugin_version: string;
      permission: string;
      scope_json: string;
      status: string;
      approved_by: string | null;
      approved_at: string | null;
    }>;
    return rows.map((row) => ({
      pluginId: row.plugin_id,
      pluginVersion: row.plugin_version,
      permission: row.permission,
      scope: JSON.parse(row.scope_json) as unknown,
      status: row.status,
      ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
      ...(row.approved_at ? { approvedAt: row.approved_at } : {})
    }));
  }

  async denyPermissions(input: { pluginId: string; pluginVersion: string }): Promise<void> {
    this.database.connection
      .prepare(
        `UPDATE source_reader_plugin_permissions
         SET status='denied', approved_by=NULL, approved_at=NULL
         WHERE plugin_id=? AND plugin_version=?`
      )
      .run(input.pluginId, input.pluginVersion);
  }

  async disable(pluginId: string): Promise<void> {
    this.database.transactionSync(() => {
      this.database.connection
        .prepare(
          `UPDATE source_reader_plugin_versions SET status='installed'
           WHERE plugin_id=? AND status='active'`
        )
        .run(pluginId);
      this.database.connection
        .prepare(
          `UPDATE source_reader_plugins
           SET enabled=0, status='disabled', active_version=NULL, updated_at=? WHERE id=?`
        )
        .run(new Date().toISOString(), pluginId);
    });
  }

  async remove(pluginId: string): Promise<void> {
    this.database.connection.prepare('DELETE FROM source_reader_plugins WHERE id=?').run(pluginId);
  }

  async quarantine(pluginId: string, version: string, reason: string): Promise<void> {
    this.database.transactionSync(() => {
      const result = this.database.connection
        .prepare(
          `UPDATE source_reader_plugin_versions
           SET status='quarantined', quarantine_reason=?
           WHERE plugin_id=? AND version=?`
        )
        .run(reason, pluginId, version);
      if (Number(result.changes) !== 1) {
        throw new Error(`Plugin version ${pluginId}@${version} does not exist`);
      }
      this.database.connection
        .prepare(
          `UPDATE source_reader_plugins
           SET active_version=NULL, enabled=0, status='quarantined', updated_at=?
           WHERE id=? AND active_version=?`
        )
        .run(new Date().toISOString(), pluginId, version);
    });
  }
}
