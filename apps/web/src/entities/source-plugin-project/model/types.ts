export type SourcePluginStudioCapability =
  'identify' | 'metadata' | 'chapter-list' | 'chapter-content';

export interface SourcePluginStudioSelectors {
  title?: string;
  author?: string;
  cover?: string;
  description?: string;
  chapterList?: string;
  chapterContent?: string;
}

export interface SourcePluginStudioBuild {
  checksum: string;
  revision?: number;
  stale: boolean;
}

export interface SourcePluginProject {
  id: string;
  name: string;
  pluginId: string;
  version: string;
  hosts: string[];
  capabilities: SourcePluginStudioCapability[];
  selectors: SourcePluginStudioSelectors;
  files: Record<string, string>;
  revision: number;
  build?: SourcePluginStudioBuild;
  createdAt: string;
  updatedAt: string;
}
