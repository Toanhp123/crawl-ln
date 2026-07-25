import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

function quoteIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQLite identifier: ${value}`);
  }
  return `"${value}"`;
}

export function sqliteTableExists(database: DatabaseSync, table: string): boolean {
  return Boolean(
    database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table)
  );
}

export function sqliteCountRows(
  database: DatabaseSync,
  table: string,
  equals?: { column: string; value: SQLInputValue }
): number {
  const tableSql = quoteIdentifier(table);
  const statement = equals
    ? database.prepare(
        `SELECT COUNT(*) AS count FROM ${tableSql} WHERE ${quoteIdentifier(equals.column)} = ?`
      )
    : database.prepare(`SELECT COUNT(*) AS count FROM ${tableSql}`);
  const row = (equals ? statement.get(equals.value) : statement.get()) as
    { count?: number | bigint } | undefined;
  return Number(row?.count ?? 0);
}

export function sqliteDistinctText(
  database: DatabaseSync,
  table: string,
  column: string
): string[] {
  return (
    database
      .prepare(`SELECT DISTINCT ${quoteIdentifier(column)} AS value FROM ${quoteIdentifier(table)}`)
      .all() as Array<{ value: string }>
  ).map((row) => row.value);
}

export function sqliteIntegrityStatus(database: DatabaseSync): {
  integrity: string | null;
  foreignKeyViolations: number;
} {
  const integrity = database.prepare('PRAGMA integrity_check').get() as
    { integrity_check?: string } | undefined;
  return {
    integrity: integrity?.integrity_check ?? null,
    foreignKeyViolations: database.prepare('PRAGMA foreign_key_check').all().length
  };
}
