import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { z } from 'zod';

const encodedValueSchema = z.union([
  z.null(),
  z.string(),
  z.number().finite(),
  z.object({ kind: z.literal('bigint'), value: z.string().regex(/^-?\d+$/) }).strict(),
  z.object({ kind: z.literal('blob'), base64: z.string() }).strict()
]);

const tableSnapshotSchema = z
  .object({
    name: z.string().min(1),
    columns: z.array(z.string().min(1)),
    rows: z.array(z.array(encodedValueSchema))
  })
  .strict();

const moduleSnapshotSchema = z
  .object({
    formatVersion: z.literal(1),
    tables: z.array(tableSnapshotSchema)
  })
  .strict();

export type EncodedSqliteValue = z.infer<typeof encodedValueSchema>;
export type SqliteTableSnapshot = z.infer<typeof tableSnapshotSchema>;
export type SqliteModuleSnapshot = z.infer<typeof moduleSnapshotSchema>;

export interface ImportSqliteTablesOptions {
  transformRow?(
    table: string,
    row: Record<string, SQLInputValue>
  ): Record<string, SQLInputValue> | null;
  afterRow?(
    table: string,
    sourceRow: Record<string, SQLInputValue>,
    importedRow: Record<string, SQLInputValue>,
    changes: number
  ): void;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function tableColumns(database: DatabaseSync, table: string): string[] {
  return (
    database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{
      name: string;
    }>
  ).map((row) => row.name);
}

function encode(value: unknown): EncodedSqliteValue {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'bigint') return { kind: 'bigint', value: value.toString() };
  if (value instanceof Uint8Array) {
    return { kind: 'blob', base64: Buffer.from(value).toString('base64') };
  }
  throw new Error(`Unsupported SQLite backup value: ${typeof value}`);
}

function decode(value: EncodedSqliteValue): SQLInputValue {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  return value.kind === 'bigint' ? BigInt(value.value) : Buffer.from(value.base64, 'base64');
}

export function createTableSnapshot(
  name: string,
  columns: string[],
  rows: Array<Record<string, unknown>>
): SqliteTableSnapshot {
  return tableSnapshotSchema.parse({
    name,
    columns,
    rows: rows.map((row) => columns.map((column) => encode(row[column] ?? null)))
  });
}

export function exportSqliteTables(
  database: DatabaseSync,
  tables: readonly string[]
): SqliteModuleSnapshot {
  return {
    formatVersion: 1,
    tables: tables.map((table) => {
      const columns = tableColumns(database, table);
      const rows = database
        .prepare(
          `SELECT ${columns.map(quoteIdentifier).join(', ')}
           FROM ${quoteIdentifier(table)}`
        )
        .all() as Array<Record<string, unknown>>;
      return createTableSnapshot(table, columns, rows);
    })
  };
}

export function importSqliteTables(
  database: DatabaseSync,
  data: unknown,
  ownedTables: readonly string[],
  options: ImportSqliteTablesOptions = {}
): Record<string, number> {
  const snapshot = moduleSnapshotSchema.parse(data);
  const allowed = new Set(ownedTables);
  const imported: Record<string, number> = {};

  for (const table of snapshot.tables) {
    if (!allowed.has(table.name)) throw new Error(`Backup table is not owned: ${table.name}`);
    const targetColumns = new Set(tableColumns(database, table.name));
    const selected = table.columns
      .map((column, index) => ({ column, index }))
      .filter(({ column }) => targetColumns.has(column));
    if (selected.length === 0) {
      imported[table.name] = 0;
      continue;
    }
    const statement = database.prepare(
      `INSERT OR IGNORE INTO ${quoteIdentifier(table.name)}
       (${selected.map(({ column }) => quoteIdentifier(column)).join(', ')})
       VALUES (${selected.map(() => '?').join(', ')})`
    );
    let count = 0;
    for (const row of table.rows) {
      if (row.length !== table.columns.length) {
        throw new Error(`Backup row width is invalid for ${table.name}`);
      }
      const sourceRow = Object.fromEntries(
        table.columns.map((column, index) => [column, decode(row[index]!)])
      ) as Record<string, SQLInputValue>;
      const importedRow = options.transformRow
        ? options.transformRow(table.name, sourceRow)
        : sourceRow;
      if (!importedRow) continue;
      const result = statement.run(...selected.map(({ column }) => importedRow[column] ?? null));
      const changes = Number(result.changes);
      count += changes;
      options.afterRow?.(table.name, sourceRow, importedRow, changes);
    }
    imported[table.name] = count;
  }

  return imported;
}

export function parseSqliteModuleSnapshot(data: unknown): SqliteModuleSnapshot {
  return moduleSnapshotSchema.parse(data);
}
