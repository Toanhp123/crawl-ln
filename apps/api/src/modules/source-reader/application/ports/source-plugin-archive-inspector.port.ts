import type { SourcePluginStudioBuildInput } from './plugin-studio-builder.port.js';

export type SourcePluginArchiveInspectionKind = 'built-package' | 'studio-source' | 'npm-workspace';

export interface SourcePluginArchiveInspectionPreview {
  checksum: string;
  kind: SourcePluginArchiveInspectionKind;
  pluginId: string;
  name: string;
  version: string;
  hosts: string[];
  capabilities: string[];
  files: string[];
  ignoredFiles: string[];
}

export interface InspectedSourcePluginArchive {
  preview: SourcePluginArchiveInspectionPreview;
  artifact?: { bytes: Uint8Array; fileName: string };
  source?: SourcePluginStudioBuildInput;
}

export interface SourcePluginArchiveInspectorPort {
  inspect(input: {
    bytes: Uint8Array;
    originalName: string;
  }): Promise<InspectedSourcePluginArchive>;
}
