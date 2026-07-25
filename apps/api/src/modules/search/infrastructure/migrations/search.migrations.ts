import { searchMigrations as searchSchemaMigrations } from './001-search-schema.js';
import { searchIndexMetadataMigration } from './002-search-index-metadata.js';

export const searchMigrations = [...searchSchemaMigrations, searchIndexMetadataMigration];
