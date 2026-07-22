import type { ExportArtifact, ExportOptions } from '../domain/export.models.js';

export interface ExportNovelCommand {
  novelId: string;
  options: ExportOptions;
}

export interface ExportCommands {
  exportNovel(command: ExportNovelCommand): Promise<ExportArtifact>;
}
