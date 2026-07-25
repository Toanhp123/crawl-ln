import { createHash } from 'node:crypto';
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

export interface SqliteImportResult {
  insertedByTable: Record<string, number>;
  skippedByTable: Record<string, number>;
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
): SqliteImportResult {
  const snapshot = moduleSnapshotSchema.parse(data);
  const allowed = new Set(ownedTables);
  const insertedByTable = Object.fromEntries(ownedTables.map((table) => [table, 0]));
  const skippedByTable = Object.fromEntries(ownedTables.map((table) => [table, 0]));

  for (const table of snapshot.tables) {
    if (!allowed.has(table.name)) throw new Error(`Backup table is not owned: ${table.name}`);
    const targetColumns = new Set(tableColumns(database, table.name));
    const selected = table.columns
      .map((column, index) => ({ column, index }))
      .filter(({ column }) => targetColumns.has(column));
    if (selected.length === 0) {
      skippedByTable[table.name] = (skippedByTable[table.name] ?? 0) + table.rows.length;
      continue;
    }
    const statement = database.prepare(
      `INSERT OR IGNORE INTO ${quoteIdentifier(table.name)}
       (${selected.map(({ column }) => quoteIdentifier(column)).join(', ')})
       VALUES (${selected.map(() => '?').join(', ')})`
    );
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
      if (!importedRow) {
        skippedByTable[table.name] = (skippedByTable[table.name] ?? 0) + 1;
        continue;
      }
      const result = statement.run(...selected.map(({ column }) => importedRow[column] ?? null));
      const changes = Number(result.changes);
      insertedByTable[table.name] = (insertedByTable[table.name] ?? 0) + changes;
      if (changes === 0) skippedByTable[table.name] = (skippedByTable[table.name] ?? 0) + 1;
      options.afterRow?.(table.name, sourceRow, importedRow, changes);
    }
  }

  return { insertedByTable, skippedByTable };
}

function writeLength(hash: ReturnType<typeof createHash>, length: number): void {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeBigUInt64BE(BigInt(length));
  hash.update(buffer);
}

function hashBytes(hash: ReturnType<typeof createHash>, tag: string, content: Uint8Array): void {
  hash.update(tag, 'utf8');
  writeLength(hash, content.byteLength);
  hash.update(content);
}

function hashValue(hash: ReturnType<typeof createHash>, value: unknown): void {
  if (value === null) {
    hash.update('N');
    return;
  }
  if (typeof value === 'string') {
    hashBytes(hash, 'S', Buffer.from(value, 'utf8'));
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot fingerprint non-finite SQLite number');
    hashBytes(hash, 'D', Buffer.from(Object.is(value, -0) ? '-0' : String(value), 'utf8'));
    return;
  }
  if (typeof value === 'bigint') {
    hashBytes(hash, 'I', Buffer.from(value.toString(), 'utf8'));
    return;
  }
  if (value instanceof Uint8Array) {
    hashBytes(hash, 'B', value);
    return;
  }
  throw new Error(`Unsupported SQLite fingerprint value: ${typeof value}`);
}

export function fingerprintSqliteTables(database: DatabaseSync, tables: readonly string[]): string {
  const schemaRows = database
    .prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table'")
    .all() as Array<{ name: string; sql: string | null }>;
  const schema = new Map(schemaRows.map((row) => [row.name, row.sql]));
  const hash = createHash('sha256');

  for (const table of [...new Set(tables)].sort()) {
    const createSql = schema.get(table);
    if (createSql === undefined)
      throw new Error(`SQLite fingerprint table does not exist: ${table}`);
    const columns = database
      .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
      .all() as Array<{ name: string; pk: number }>;
    if (columns.length === 0) throw new Error(`SQLite fingerprint table has no columns: ${table}`);
    const primaryKey = columns
      .filter((column) => Number(column.pk) > 0)
      .sort((left, right) => Number(left.pk) - Number(right.pk))
      .map((column) => column.name);
    const withoutRowid = /\bWITHOUT\s+ROWID\b/i.test(createSql ?? '');
    const orderBy = primaryKey.length
      ? primaryKey.map(quoteIdentifier).join(', ')
      : withoutRowid
        ? columns.map((column) => quoteIdentifier(column.name)).join(', ')
        : 'rowid';

    hashBytes(hash, 'T', Buffer.from(table, 'utf8'));
    for (const column of columns) hashBytes(hash, 'C', Buffer.from(column.name, 'utf8'));
    const query = database.prepare(
      `SELECT ${columns.map((column) => quoteIdentifier(column.name)).join(', ')}
       FROM ${quoteIdentifier(table)} ORDER BY ${orderBy}`
    );
    for (const row of query.iterate() as Iterable<Record<string, unknown>>) {
      hash.update('R');
      for (const column of columns) hashValue(hash, row[column.name]);
    }
  }

  return hash.digest('hex');
}

export function parseSqliteModuleSnapshot(data: unknown): SqliteModuleSnapshot {
  return moduleSnapshotSchema.parse(data);
}
