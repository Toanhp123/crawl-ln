import type { PluginStudioDraftRepository } from '../../ports/plugin-studio-draft.repository.js';
import type { PluginStudioBuilderPort } from '../../ports/plugin-studio-builder.port.js';
import type {
  InspectedSourcePluginArchive,
  SourcePluginArchiveInspectionPreview,
  SourcePluginArchiveInspectorPort
} from '../../ports/source-plugin-archive-inspector.port.js';
import type {
  ImportPluginStudioProjectResolution,
  PluginStudioService
} from './plugin-studio.service.js';

type FailureKind = 'validation' | 'conflict';

export class SourcePluginArchiveFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'SourcePluginArchiveFailure';
  }
}

interface Installer {
  install(input: { bytes: Uint8Array; originalName: string }): Promise<Record<string, unknown>>;
}

interface SourcePluginArchiveServiceOptions {
  inspector: SourcePluginArchiveInspectorPort;
  builder: PluginStudioBuilderPort;
  drafts: PluginStudioDraftRepository;
  studio: Pick<PluginStudioService, 'importProject'>;
  installer: Installer;
}

export interface SourcePluginArchivePreview extends SourcePluginArchiveInspectionPreview {
  conflicts: Array<{ id: string; name: string; version: string; revision: number }>;
}

export class SourcePluginArchiveService {
  constructor(private readonly options: SourcePluginArchiveServiceOptions) {}

  async inspect(input: {
    bytes: Uint8Array;
    originalName: string;
  }): Promise<SourcePluginArchivePreview> {
    const inspected = await this.inspectArchive(input);
    const conflicts = (await this.options.drafts.list())
      .filter((draft) => draft.pluginId === inspected.preview.pluginId)
      .map((draft) => ({
        id: draft.id,
        name: draft.name,
        version: draft.version,
        revision: draft.revision ?? 1
      }));
    return { ...inspected.preview, conflicts };
  }

  async install(input: {
    bytes: Uint8Array;
    originalName: string;
    expectedChecksum: string;
  }): Promise<Record<string, unknown>> {
    const inspected = await this.inspectArchive(input);
    this.assertChecksum(inspected, input.expectedChecksum);

    let artifact = inspected.artifact;
    if (!artifact && inspected.source) {
      const built = await this.options.builder.build(inspected.source);
      artifact = { bytes: built.packageBytes, fileName: built.artifactName };
    }
    if (!artifact) {
      throw new SourcePluginArchiveFailure(
        'validation',
        'Source plugin archive cannot be installed'
      );
    }

    const installed = await this.options.installer.install({
      bytes: artifact.bytes,
      originalName: artifact.fileName
    });
    const { packagePath: _packagePath, stagingPath: _stagingPath, ...safe } = installed;
    return safe;
  }

  async importProject(input: {
    bytes: Uint8Array;
    originalName: string;
    expectedChecksum: string;
    resolution: ImportPluginStudioProjectResolution;
  }) {
    const inspected = await this.inspectArchive(input);
    this.assertChecksum(inspected, input.expectedChecksum);
    if (!inspected.source) {
      throw new SourcePluginArchiveFailure(
        'validation',
        'A built package cannot be imported as a Plugin Studio project'
      );
    }
    return this.options.studio.importProject({
      source: inspected.source,
      resolution: input.resolution
    });
  }

  private async inspectArchive(input: {
    bytes: Uint8Array;
    originalName: string;
  }): Promise<InspectedSourcePluginArchive> {
    try {
      return await this.options.inspector.inspect(input);
    } catch (error) {
      if (error instanceof SourcePluginArchiveFailure) throw error;
      throw new SourcePluginArchiveFailure(
        'validation',
        error instanceof Error ? error.message : 'Source plugin archive inspection failed'
      );
    }
  }

  private assertChecksum(inspected: InspectedSourcePluginArchive, expectedChecksum: string): void {
    if (inspected.preview.checksum !== expectedChecksum) {
      throw new SourcePluginArchiveFailure(
        'conflict',
        'Source plugin archive checksum does not match the inspected preview'
      );
    }
  }
}
