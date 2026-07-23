import type { SqliteDatabase } from './sqlite-database.js';

export class IncompatibleDevelopmentDataError extends Error {
  constructor() {
    super(
      'This database is incompatible with the current greenfield application. Reset development data with: npm run clean -- --data'
    );
    this.name = 'IncompatibleDevelopmentDataError';
  }
}

export function assertCurrentOrEmptyDatabase(database: SqliteDatabase): void {
  const tables = (
    database.connection
      .prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
  if (tables.length === 0 || tables.includes('platform_module_migrations')) return;
  throw new IncompatibleDevelopmentDataError();
}
