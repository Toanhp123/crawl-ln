import type { ModuleMigration } from '../../../../platform/database/module-migration.js';

const sourceReaderSchemaMigration: ModuleMigration = {
  module: 'source-reader',
  version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE source_reader_plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trust_level TEXT NOT NULL,
        status TEXT NOT NULL,
        active_version TEXT,
        enabled INTEGER NOT NULL DEFAULT 0,
        installed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE source_reader_plugin_versions (
        plugin_id TEXT NOT NULL,
        version TEXT NOT NULL,
        package_path TEXT,
        checksum TEXT NOT NULL,
        signature_status TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        sdk_range TEXT NOT NULL,
        installed_at TEXT NOT NULL,
        activated_at TEXT,
        trust_level TEXT NOT NULL DEFAULT 'local-unverified',
        status TEXT NOT NULL DEFAULT 'installed',
        quarantine_reason TEXT,
        compatibility_issues_json TEXT NOT NULL DEFAULT '[]',
        activated_extensions_json TEXT NOT NULL DEFAULT '{}',
        sandbox_protocol_version INTEGER,
        PRIMARY KEY(plugin_id, version),
        FOREIGN KEY(plugin_id) REFERENCES source_reader_plugins(id) ON DELETE CASCADE
      );

      CREATE TABLE source_reader_plugin_permissions (
        plugin_id TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        permission TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        status TEXT NOT NULL,
        approved_by TEXT,
        approved_at TEXT,
        PRIMARY KEY(plugin_id, plugin_version, permission, scope_json),
        FOREIGN KEY(plugin_id, plugin_version)
          REFERENCES source_reader_plugin_versions(plugin_id, version) ON DELETE CASCADE
      );

      CREATE TABLE source_reader_credentials (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT,
        plugin_id TEXT,
        domain TEXT,
        name TEXT NOT NULL,
        strategy TEXT NOT NULL,
        encrypted_payload BLOB NOT NULL,
        encryption_metadata_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE source_reader_network_profiles (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT,
        name TEXT NOT NULL,
        route_type TEXT NOT NULL,
        regions_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        encrypted_config BLOB,
        encryption_metadata_json TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        health_status TEXT NOT NULL DEFAULT 'unknown',
        last_health_check_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE source_reader_sessions (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        credential_profile_id TEXT NOT NULL,
        owner_type TEXT NOT NULL,
        owner_id TEXT,
        network_profile_id TEXT,
        network_binding TEXT NOT NULL,
        encrypted_session BLOB NOT NULL,
        encryption_metadata_json TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at TEXT,
        last_used_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(credential_profile_id) REFERENCES source_reader_credentials(id) ON DELETE CASCADE,
        FOREIGN KEY(network_profile_id) REFERENCES source_reader_network_profiles(id) ON DELETE SET NULL
      );

      CREATE TABLE source_reader_auth_challenges (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        credential_profile_id TEXT,
        network_profile_id TEXT,
        owner_id TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        encrypted_state BLOB,
        encryption_metadata_json TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY(credential_profile_id) REFERENCES source_reader_credentials(id) ON DELETE CASCADE,
        FOREIGN KEY(network_profile_id) REFERENCES source_reader_network_profiles(id) ON DELETE SET NULL
      );

      CREATE TABLE source_reader_cache_entries (
        cache_key TEXT PRIMARY KEY,
        capability TEXT NOT NULL,
        plugin_id TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        contract_version INTEGER NOT NULL,
        extension_contract_versions_json TEXT NOT NULL DEFAULT '{}',
        normalized_url TEXT,
        request_fingerprint TEXT NOT NULL,
        scope TEXT NOT NULL,
        scope_identity_hash TEXT NOT NULL,
        network_scope_hash TEXT NOT NULL,
        network_identity_hash TEXT NOT NULL,
        payload BLOB NOT NULL,
        encoding TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        stale_until TEXT,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_accessed_at TEXT NOT NULL
      );

      CREATE TABLE source_reader_cache_tags (
        cache_key TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY(cache_key, tag),
        FOREIGN KEY(cache_key) REFERENCES source_reader_cache_entries(cache_key) ON DELETE CASCADE
      );

      CREATE TABLE source_reader_installations (
        id TEXT PRIMARY KEY,
        plugin_id TEXT,
        plugin_version TEXT,
        original_package_path TEXT NOT NULL,
        staging_path TEXT,
        status TEXT NOT NULL,
        error_code TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE source_reader_health_checks (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        capability TEXT,
        status TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        failure_code TEXT,
        checked_at TEXT NOT NULL
      );

      CREATE INDEX idx_source_reader_plugins_status
        ON source_reader_plugins(enabled, status);
      CREATE INDEX idx_source_reader_plugin_versions_status
        ON source_reader_plugin_versions(plugin_id, status);
      CREATE INDEX idx_source_reader_credentials_resolution
        ON source_reader_credentials(owner_type, owner_id, plugin_id, domain, enabled);
      CREATE INDEX idx_source_reader_network_resolution
        ON source_reader_network_profiles(owner_type, owner_id, enabled, health_status);
      CREATE INDEX idx_source_reader_sessions_resolution
        ON source_reader_sessions(
          plugin_id, plugin_version, credential_profile_id, owner_id, network_profile_id, status
        );
      CREATE INDEX idx_source_reader_challenges_pending
        ON source_reader_auth_challenges(status, expires_at);
      CREATE INDEX idx_source_reader_cache_expiry
        ON source_reader_cache_entries(expires_at, stale_until);
      CREATE INDEX idx_source_reader_cache_plugin
        ON source_reader_cache_entries(plugin_id, plugin_version, capability);
      CREATE INDEX idx_source_reader_cache_tags_tag
        ON source_reader_cache_tags(tag, cache_key);
      CREATE INDEX idx_source_reader_health_plugin_checked
        ON source_reader_health_checks(plugin_id, checked_at DESC);
      CREATE INDEX idx_source_reader_health_capability_window
        ON source_reader_health_checks(plugin_id, plugin_version, capability, checked_at DESC);
    `);
  }
};

export const sourceReaderMigrations: ModuleMigration[] = [sourceReaderSchemaMigration];
