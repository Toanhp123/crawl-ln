import type { MigrationRegistry } from './migration-registry.js';
import type { SqliteDatabase } from './sqlite-database.js';

export function runRegisteredMigrations(
  database: SqliteDatabase,
  registry: MigrationRegistry
): void {
  database.connection.exec(`
    CREATE TABLE IF NOT EXISTS platform_module_migrations (
      module_name TEXT NOT NULL,
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY(module_name, version)
    );
  `);

  const applied = new Set(
    (
      database.connection
        .prepare('SELECT module_name, version FROM platform_module_migrations')
        .all() as Array<{ module_name: string; version: number }>
    ).map((row) => `${row.module_name}:${Number(row.version)}`)
  );
  const record = database.connection.prepare(
    `INSERT INTO platform_module_migrations(module_name, version, applied_at)
     VALUES (?, ?, ?)`
  );

  for (const migration of registry.list()) {
    const key = `${migration.module}:${migration.version}`;
    if (applied.has(key)) continue;
    database.transactionSync(() => {
      migration.up(database.connection);
      record.run(migration.module, migration.version, new Date().toISOString());
    });
    applied.add(key);
  }
}
