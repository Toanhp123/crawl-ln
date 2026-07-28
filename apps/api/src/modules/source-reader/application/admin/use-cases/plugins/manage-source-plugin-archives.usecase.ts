import type { SourceReaderActor } from '../../../ports/source-reader-actor.port.js';
import type {
  ImportPluginStudioProjectResolution,
  PluginStudioService
} from '../../services/plugin-studio.service.js';
import type { SourcePluginArchiveService } from '../../services/source-plugin-archive.service.js';
import type { SourceReaderAuthorizationPolicy } from '../../policies/source-reader-authorization.policy.js';

type ArchiveOperations = Pick<SourcePluginArchiveService, 'inspect' | 'install' | 'importProject'>;

function requireAdmin(policy: SourceReaderAuthorizationPolicy, actor: SourceReaderActor): void {
  policy.requireRole(actor, 'source-admin');
}

export class InspectSourcePluginArchiveUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly archives: Pick<ArchiveOperations, 'inspect'>
  ) {}

  execute(input: { actor: SourceReaderActor; bytes: Uint8Array; originalName: string }) {
    requireAdmin(this.authorization, input.actor);
    return this.archives.inspect({ bytes: input.bytes, originalName: input.originalName });
  }
}

export class InstallSourcePluginArchiveUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly archives: Pick<ArchiveOperations, 'install'>
  ) {}

  execute(input: {
    actor: SourceReaderActor;
    bytes: Uint8Array;
    originalName: string;
    expectedChecksum: string;
  }) {
    requireAdmin(this.authorization, input.actor);
    return this.archives.install({
      bytes: input.bytes,
      originalName: input.originalName,
      expectedChecksum: input.expectedChecksum
    });
  }
}

export class ImportSourcePluginProjectUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly archives: Pick<ArchiveOperations, 'importProject'>
  ) {}

  execute(input: {
    actor: SourceReaderActor;
    bytes: Uint8Array;
    originalName: string;
    expectedChecksum: string;
    resolution: ImportPluginStudioProjectResolution;
  }): ReturnType<PluginStudioService['importProject']> {
    requireAdmin(this.authorization, input.actor);
    return this.archives.importProject({
      bytes: input.bytes,
      originalName: input.originalName,
      expectedChecksum: input.expectedChecksum,
      resolution: input.resolution
    });
  }
}
