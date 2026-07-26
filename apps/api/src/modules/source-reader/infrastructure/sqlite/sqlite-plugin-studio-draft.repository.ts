import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import type {
  PluginStudioDraftRepository,
  SourcePluginStudioDraft
} from '../../application/ports/plugin-studio-draft.repository.js';

interface DraftRow {
  id: string;
  name: string;
  plugin_id: string;
  version: string;
  hosts_json: string;
  capabilities_json: string;
  selectors_json: string;
  files_json: string;
  revision: number;
  artifact_checksum: string | null;
  built_revision: number | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DraftRow): SourcePluginStudioDraft {
  return {
    id: row.id,
    name: row.name,
    pluginId: row.plugin_id,
    version: row.version,
    hosts: JSON.parse(row.hosts_json) as SourcePluginStudioDraft['hosts'],
    capabilities: JSON.parse(row.capabilities_json) as SourcePluginStudioDraft['capabilities'],
    selectors: JSON.parse(row.selectors_json) as SourcePluginStudioDraft['selectors'],
    files: JSON.parse(row.files_json) as SourcePluginStudioDraft['files'],
    revision: row.revision,
    ...(row.artifact_checksum ? { artifactChecksum: row.artifact_checksum } : {}),
    ...(row.built_revision !== null ? { builtRevision: row.built_revision } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class SqlitePluginStudioDraftRepository implements PluginStudioDraftRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async create(draft: SourcePluginStudioDraft): Promise<SourcePluginStudioDraft> {
    this.database.connection
      .prepare(
        `INSERT INTO source_reader_plugin_studio_projects (
          id, name, plugin_id, version, hosts_json, capabilities_json, selectors_json,
          files_json, revision, artifact_checksum, built_revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        draft.id,
        draft.name,
        draft.pluginId,
        draft.version,
        JSON.stringify(draft.hosts),
        JSON.stringify(draft.capabilities),
        JSON.stringify(draft.selectors),
        JSON.stringify(draft.files),
        draft.revision ?? 1,
        draft.artifactChecksum ?? null,
        draft.builtRevision ?? null,
        draft.createdAt,
        draft.updatedAt
      );
    return (await this.findById(draft.id))!;
  }

  async findById(id: string): Promise<SourcePluginStudioDraft | undefined> {
    const row = this.database.connection
      .prepare('SELECT * FROM source_reader_plugin_studio_projects WHERE id = ?')
      .get(id) as DraftRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  async list(): Promise<SourcePluginStudioDraft[]> {
    return (
      this.database.connection
        .prepare('SELECT * FROM source_reader_plugin_studio_projects ORDER BY updated_at DESC')
        .all() as unknown as DraftRow[]
    ).map(mapRow);
  }

  async update(
    id: string,
    patch: Partial<Omit<SourcePluginStudioDraft, 'id' | 'createdAt'>>,
    expectedRevision?: number
  ): Promise<SourcePluginStudioDraft> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Plugin Studio project ${id} was not found`);
    const next = { ...current, ...patch };
    const result = this.database.connection
      .prepare(
        `UPDATE source_reader_plugin_studio_projects SET
          name = ?, plugin_id = ?, version = ?, hosts_json = ?, capabilities_json = ?,
          selectors_json = ?, files_json = ?, revision = ?, artifact_checksum = ?,
          built_revision = ?, updated_at = ?
        WHERE id = ? AND (? IS NULL OR revision = ?)`
      )
      .run(
        next.name,
        next.pluginId,
        next.version,
        JSON.stringify(next.hosts),
        JSON.stringify(next.capabilities),
        JSON.stringify(next.selectors),
        JSON.stringify(next.files),
        next.revision ?? 1,
        next.artifactChecksum ?? null,
        next.builtRevision ?? null,
        next.updatedAt,
        id,
        expectedRevision ?? null,
        expectedRevision ?? null
      );
    if (result.changes === 0) {
      throw Object.assign(new Error(`Plugin Studio project ${id} revision is stale`), {
        kind: 'conflict' as const
      });
    }
    return (await this.findById(id))!;
  }

  async remove(id: string): Promise<void> {
    this.database.connection
      .prepare('DELETE FROM source_reader_plugin_studio_projects WHERE id = ?')
      .run(id);
  }
}
