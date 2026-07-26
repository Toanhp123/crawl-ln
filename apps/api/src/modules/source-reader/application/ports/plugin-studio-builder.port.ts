import type { SourceDataCapability, SourcePluginManifest } from '@novel-tool/source-plugin-sdk';
import type { SourcePluginStudioSelectors } from './plugin-studio-draft.repository.js';

export interface SourcePluginStudioBuildInput {
  id: string;
  name: string;
  version: string;
  hosts: string[];
  capabilities: SourceDataCapability[];
  selectors: SourcePluginStudioSelectors;
  files: Record<string, string>;
}

export interface SourcePluginStudioBuildResult {
  manifest: SourcePluginManifest;
  files: Record<string, string>;
  packageBytes: Uint8Array;
  artifactName: string;
  checksum: string;
}

export interface PluginStudioBuilderPort {
  createScaffold(input: SourcePluginStudioBuildInput): Record<string, string>;
  build(input: SourcePluginStudioBuildInput): Promise<SourcePluginStudioBuildResult>;
}
