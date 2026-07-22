import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import type { PluginHealthRepository } from '../../application/ports/plugin-health.repository.js';

export class SqlitePluginHealthRepository implements PluginHealthRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async record(input: Parameters<PluginHealthRepository['record']>[0]): Promise<void> {
    this.database.connection
      .prepare(
        `INSERT INTO source_reader_health_checks(
          id, plugin_id, plugin_version, capability, status,
          duration_ms, failure_code, checked_at
        ) VALUES(?,?,?,?,?,?,?,?)`
      )
      .run(
        input.id,
        input.pluginId,
        input.pluginVersion,
        input.capability ?? null,
        input.status,
        Math.max(0, Math.round(input.durationMs)),
        input.failureCode ?? null,
        input.checkedAt
      );
  }

  async recentFailures(
    input: Parameters<PluginHealthRepository['recentFailures']>[0]
  ): Promise<number> {
    const row = this.database.connection
      .prepare(
        `SELECT COUNT(*) AS count
         FROM source_reader_health_checks
         WHERE plugin_id=? AND plugin_version=? AND capability=?
           AND status='failed' AND checked_at>=?`
      )
      .get(input.pluginId, input.pluginVersion, input.capability, input.since) as {
      count: number;
    };
    return Number(row.count);
  }

  async recentFailuresByCode(
    input: Parameters<PluginHealthRepository['recentFailuresByCode']>[0]
  ): Promise<number> {
    const row = this.database.connection
      .prepare(
        `SELECT COUNT(*) AS count
         FROM source_reader_health_checks
         WHERE plugin_id=? AND plugin_version=? AND failure_code=?
           AND status='failed' AND checked_at>=?`
      )
      .get(input.pluginId, input.pluginVersion, input.failureCode, input.since) as {
      count: number;
    };
    return Number(row.count);
  }
}
