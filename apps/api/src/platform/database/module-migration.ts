import type { DatabaseSync } from 'node:sqlite';

export interface ModuleMigration {
  module: string;
  version: number;
  up(database: DatabaseSync): void;
}
