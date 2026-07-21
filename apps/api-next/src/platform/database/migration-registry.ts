import type { ModuleMigration } from './module-migration.js';

export class MigrationRegistry {
  private readonly migrations = new Map<string, Map<number, ModuleMigration>>();

  register(moduleName: string, migrations: ModuleMigration[]): void {
    const registered = this.migrations.get(moduleName) ?? new Map<number, ModuleMigration>();
    const pendingVersions = new Set<number>();

    for (const migration of migrations) {
      if (migration.module !== moduleName) {
        throw new Error(
          `Migration module ${migration.module} does not match registration ${moduleName}`
        );
      }
      if (!Number.isInteger(migration.version) || migration.version < 1) {
        throw new Error(`Migration version must be a positive integer: ${migration.version}`);
      }
      if (registered.has(migration.version) || pendingVersions.has(migration.version)) {
        throw new Error(`Duplicate migration ${moduleName}@${migration.version}`);
      }
      pendingVersions.add(migration.version);
    }

    for (const migration of migrations) registered.set(migration.version, migration);
    this.migrations.set(moduleName, registered);
  }

  list(): ModuleMigration[] {
    return [...this.migrations.values()]
      .flatMap((migrations) => [...migrations.values()])
      .sort(
        (left, right) => left.module.localeCompare(right.module) || left.version - right.version
      );
  }
}
