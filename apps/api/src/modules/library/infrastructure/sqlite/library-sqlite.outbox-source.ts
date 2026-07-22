import type { ApplicationEvent } from '../../../../platform/events/application-event.js';
import type { OutboxSource } from '../../../../platform/events/outbox-source.js';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import { mapLibraryOutboxRow } from './library-row.schemas.js';

export class LibrarySqliteOutboxSource implements OutboxSource {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly clock: { now(): Date } = { now: () => new Date() },
    private readonly claimTimeoutMs = 30_000
  ) {}

  claimBatch(limit: number): Promise<ApplicationEvent[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('Outbox claim limit must be a positive integer');
    }
    return Promise.resolve(
      this.database.transactionSync(() => {
        const now = this.clock.now();
        const claimedAt = now.toISOString();
        const staleBefore = new Date(now.getTime() - this.claimTimeoutMs).toISOString();
        const rows = this.database.connection
          .prepare(
            `SELECT *
               FROM library_outbox
              WHERE delivered_at IS NULL
                AND (claimed_at IS NULL OR claimed_at <= ?)
              ORDER BY occurred_at ASC, id ASC
              LIMIT ?`
          )
          .all(staleBefore, limit) as Record<string, unknown>[];
        const claim = this.database.connection.prepare(
          `UPDATE library_outbox
              SET claimed_at = ?, delivery_attempts = delivery_attempts + 1
            WHERE id = ? AND delivered_at IS NULL`
        );
        for (const row of rows) claim.run(claimedAt, String(row.id));
        return rows.map(mapLibraryOutboxRow);
      })
    );
  }

  markDelivered(ids: string[], deliveredAt: string): Promise<void> {
    if (ids.length === 0) return Promise.resolve();
    this.database.transactionSync(() => {
      const statement = this.database.connection.prepare(
        `UPDATE library_outbox
            SET delivered_at = ?, claimed_at = NULL
          WHERE id = ? AND delivered_at IS NULL`
      );
      for (const id of ids) statement.run(deliveredAt, id);
    });
    return Promise.resolve();
  }
}
