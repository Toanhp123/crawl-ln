import { z } from 'zod';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import type { SchedulerRepository } from '../../application/ports/scheduler.repository.js';
import type {
  AutoUpdateInterval,
  SchedulerDiagnostic,
  SchedulerPolicy
} from '../../domain/scheduler.models.js';
import { assertAutoUpdateInterval } from '../../domain/scheduler-policy.js';
import { sqliteUpsertUpdate } from './sqlite-syntax.js';

const policyRowSchema = z.object({
  novel_id: z.string().min(1),
  enabled: z.coerce.number().int().min(0).max(1),
  interval_minutes: z.coerce.number().int(),
  last_check_at: z.string().datetime({ offset: true }).nullable(),
  next_check_at: z.string().datetime({ offset: true }).nullable(),
  last_result: z.enum(['idle', 'up_to_date', 'queued', 'skipped_active_task', 'failed']),
  consecutive_failures: z.coerce.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true })
});

const diagnosticRowSchema = z.object({
  id: z.string().min(1),
  novel_id: z.string().min(1),
  source_name: z.string().min(1),
  result: z.enum(['idle', 'up_to_date', 'queued', 'skipped_active_task', 'failed']),
  message: z.string(),
  new_chapter_count: z.coerce.number().int().nonnegative(),
  pending_chapter_count: z.coerce.number().int().nonnegative(),
  duration_ms: z.coerce.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true })
});

function mapPolicy(input: unknown): SchedulerPolicy {
  const row = policyRowSchema.parse(input);
  assertAutoUpdateInterval(row.interval_minutes);
  return {
    novelId: row.novel_id,
    enabled: row.enabled === 1,
    intervalMinutes: row.interval_minutes,
    ...(row.last_check_at ? { lastCheckAt: row.last_check_at } : {}),
    ...(row.next_check_at ? { nextCheckAt: row.next_check_at } : {}),
    lastResult: row.last_result,
    consecutiveFailures: row.consecutive_failures,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDiagnostic(input: unknown): SchedulerDiagnostic {
  const row = diagnosticRowSchema.parse(input);
  return {
    id: row.id,
    novelId: row.novel_id,
    sourceName: row.source_name,
    result: row.result,
    message: row.message,
    newChapterCount: row.new_chapter_count,
    pendingChapterCount: row.pending_chapter_count,
    durationMs: row.duration_ms,
    createdAt: row.created_at
  };
}

export class SchedulerSqliteRepository implements SchedulerRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async upsertPolicy(input: {
    novelId: string;
    enabled: boolean;
    intervalMinutes: AutoUpdateInterval;
    nextCheckAt?: string;
    now: string;
  }): Promise<SchedulerPolicy> {
    this.database.connection
      .prepare(
        `INSERT INTO scheduler_policies(
           novel_id, enabled, interval_minutes, next_check_at, created_at, updated_at
         ) VALUES(?,?,?,?,?,?)
         ON CONFLICT(novel_id) ${sqliteUpsertUpdate}
           enabled=excluded.enabled,
           interval_minutes=excluded.interval_minutes,
           next_check_at=excluded.next_check_at,
           updated_at=excluded.updated_at`
      )
      .run(
        input.novelId,
        input.enabled ? 1 : 0,
        input.intervalMinutes,
        input.enabled ? (input.nextCheckAt ?? input.now) : null,
        input.now,
        input.now
      );
    return (await this.findPolicy(input.novelId))!;
  }

  async findPolicy(novelId: string): Promise<SchedulerPolicy | null> {
    const row = this.database.connection
      .prepare('SELECT * FROM scheduler_policies WHERE novel_id=?')
      .get(novelId);
    return row ? mapPolicy(row) : null;
  }

  async findPolicies(novelIds: string[]): Promise<SchedulerPolicy[]> {
    if (novelIds.length === 0) return [];
    return this.database.connection
      .prepare(
        `SELECT * FROM scheduler_policies
         WHERE novel_id IN (${novelIds.map(() => '?').join(', ')})`
      )
      .all(...novelIds)
      .map(mapPolicy);
  }

  async listDue(now: string, limit: number): Promise<SchedulerPolicy[]> {
    return this.database.connection
      .prepare(
        `SELECT * FROM scheduler_policies
         WHERE enabled=1 AND (next_check_at IS NULL OR next_check_at<=?)
         ORDER BY COALESCE(next_check_at, created_at), novel_id
         LIMIT ?`
      )
      .all(now, limit)
      .map(mapPolicy);
  }

  async countMonitored(): Promise<number> {
    const row = this.database.connection
      .prepare('SELECT COUNT(*) AS count FROM scheduler_policies WHERE enabled=1')
      .get() as { count: number };
    return Number(row.count);
  }

  async countDue(now: string): Promise<number> {
    const row = this.database.connection
      .prepare(
        `SELECT COUNT(*) AS count FROM scheduler_policies
         WHERE enabled=1 AND (next_check_at IS NULL OR next_check_at<=?)`
      )
      .get(now) as { count: number };
    return Number(row.count);
  }

  async recordState(
    novelId: string,
    state: Parameters<SchedulerRepository['recordState']>[1]
  ): Promise<void> {
    this.database.connection
      .prepare(
        `UPDATE scheduler_policies SET
           last_check_at=?, next_check_at=?, last_result=?,
           consecutive_failures=?, updated_at=?
         WHERE novel_id=?`
      )
      .run(
        state.lastCheckAt,
        state.nextCheckAt,
        state.result,
        state.consecutiveFailures,
        state.updatedAt,
        novelId
      );
  }

  async addDiagnostic(diagnostic: SchedulerDiagnostic): Promise<void> {
    this.database.connection
      .prepare(
        `INSERT INTO scheduler_diagnostics(
           id, novel_id, source_name, result, message, new_chapter_count,
           pending_chapter_count, duration_ms, created_at
         ) VALUES(?,?,?,?,?,?,?,?,?)`
      )
      .run(
        diagnostic.id,
        diagnostic.novelId,
        diagnostic.sourceName,
        diagnostic.result,
        diagnostic.message,
        diagnostic.newChapterCount,
        diagnostic.pendingChapterCount,
        diagnostic.durationMs,
        diagnostic.createdAt
      );
  }

  async listDiagnostics(novelId: string, limit = 30): Promise<SchedulerDiagnostic[]> {
    return this.database.connection
      .prepare(
        `SELECT * FROM scheduler_diagnostics
         WHERE novel_id=? ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(novelId, limit)
      .map(mapDiagnostic);
  }

  async pruneDiagnostics(novelId: string, keep: number): Promise<void> {
    this.database.connection
      .prepare(
        `DELETE FROM scheduler_diagnostics
         WHERE novel_id=? AND id NOT IN (
           SELECT id FROM scheduler_diagnostics
           WHERE novel_id=? ORDER BY created_at DESC, id DESC LIMIT ?
         )`
      )
      .run(novelId, novelId, keep);
  }
}
