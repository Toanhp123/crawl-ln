import { ingestionMigrations } from './index.js';

export function createIngestionModule() {
  return {
    name: 'ingestion',
    migrations: ingestionMigrations
  };
}
