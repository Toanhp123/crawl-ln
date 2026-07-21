import { libraryMigrations } from './index.js';

export function createLibraryModule() {
  return {
    name: 'library',
    migrations: libraryMigrations
  };
}
