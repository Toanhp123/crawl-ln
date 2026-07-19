import type { AutoUpdateInterval, Novel, NovelUpdateResultCode } from '@novel-tool/shared';
import { z } from 'zod';
import type { AutoUpdatePolicyRepository } from '../../application/ports/auto-update-policy.repository.js';
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';

const rowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source_url: z.string().url(),
  source_name: z.string().min(1),
  status: z.enum(['analyzed', 'crawling', 'completed', 'failed']),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  auto_update_enabled: z.coerce.number().int().min(0).max(1),
  update_interval_minutes: z.coerce
    .number()
    .int()
    .refine((v) => [0, 360, 720, 1440, 10080].includes(v)),
  last_update_check_at: z.string().datetime({ offset: true }).nullable(),
  next_update_check_at: z.string().datetime({ offset: true }).nullable(),
  last_update_result: z.enum(['idle', 'up_to_date', 'queued', 'skipped_active_task', 'failed']),
  consecutive_update_failures: z.coerce.number().int().nonnegative()
});
function mapPolicyNovelRow(input: Record<string, unknown>): Novel {
  const row = rowSchema.parse(input);
  return {
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    autoUpdateEnabled: row.auto_update_enabled === 1,
    updateIntervalMinutes: row.update_interval_minutes as AutoUpdateInterval,
    lastUpdateCheckAt: row.last_update_check_at ?? undefined,
    nextUpdateCheckAt: row.next_update_check_at ?? undefined,
    lastUpdateResult: row.last_update_result,
    consecutiveUpdateFailures: row.consecutive_update_failures
  };
}

export class AutoUpdatePolicySqliteRepository implements AutoUpdatePolicyRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async updatePolicy(
    id: string,
    enabled: boolean,
    intervalMinutes: AutoUpdateInterval,
    nowIso: string,
    nextCheckAt?: string
  ): Promise<Novel | null> {
    this.database.connection
      .prepare(
        `UPDATE novels SET auto_update_enabled = ?, update_interval_minutes = ?, next_update_check_at = ?, updated_at = ? WHERE id = ?`
      )
      .run(enabled ? 1 : 0, intervalMinutes, enabled ? (nextCheckAt ?? nowIso) : null, nowIso, id);
    const row = this.database.connection.prepare('SELECT * FROM novels WHERE id = ?').get(id) as
      Record<string, unknown> | undefined;
    return row ? mapPolicyNovelRow(row) : null;
  }

  async listDue(nowIso: string, limit: number): Promise<Novel[]> {
    const rows = this.database.connection
      .prepare(
        `SELECT * FROM novels WHERE auto_update_enabled = 1 AND (next_update_check_at IS NULL OR next_update_check_at <= ?) ORDER BY COALESCE(next_update_check_at, created_at) ASC LIMIT ?`
      )
      .all(nowIso, limit) as Record<string, unknown>[];
    return rows.map(mapPolicyNovelRow);
  }

  async countMonitored(): Promise<number> {
    const row = this.database.connection
      .prepare('SELECT COUNT(*) AS count FROM novels WHERE auto_update_enabled = 1')
      .get() as { count: number };
    return Number(row.count);
  }

  async countDue(nowIso: string): Promise<number> {
    const row = this.database.connection
      .prepare(
        'SELECT COUNT(*) AS count FROM novels WHERE auto_update_enabled = 1 AND (next_update_check_at IS NULL OR next_update_check_at <= ?)'
      )
      .get(nowIso) as { count: number };
    return Number(row.count);
  }

  async recordState(
    id: string,
    state: {
      lastCheckAt: string;
      nextCheckAt: string;
      result: NovelUpdateResultCode;
      consecutiveFailures: number;
    }
  ): Promise<void> {
    this.database.connection
      .prepare(
        `UPDATE novels SET last_update_check_at = ?, next_update_check_at = ?, last_update_result = ?, consecutive_update_failures = ? WHERE id = ?`
      )
      .run(state.lastCheckAt, state.nextCheckAt, state.result, state.consecutiveFailures, id);
  }
}
