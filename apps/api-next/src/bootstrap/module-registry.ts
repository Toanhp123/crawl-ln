import { MigrationRegistry } from '../platform/database/migration-registry.js';
import type { ModuleMigration } from '../platform/database/module-migration.js';
import type { OutboxSource } from '../platform/events/outbox-source.js';

export interface RegisteredModule {
  name: string;
  migrations: ModuleMigration[];
  outbox?: OutboxSource;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

export class ModuleRegistry {
  private readonly modules: RegisteredModule[] = [];

  register(...modules: RegisteredModule[]): void {
    this.modules.push(...modules);
  }

  list(): RegisteredModule[] {
    return [...this.modules];
  }

  migrationRegistry(): MigrationRegistry {
    const registry = new MigrationRegistry();
    for (const module of this.modules) registry.register(module.name, module.migrations);
    return registry;
  }

  outboxSources(): OutboxSource[] {
    return this.modules
      .map((module) => module.outbox)
      .filter((source): source is OutboxSource => source !== undefined);
  }
}
