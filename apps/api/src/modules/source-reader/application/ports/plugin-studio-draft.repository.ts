import type { SourceDataCapability } from '@novel-tool/source-plugin-sdk';

export interface SourcePluginStudioSelectors {
  title?: string;
  author?: string;
  cover?: string;
  description?: string;
  chapterList?: string;
  chapterContent?: string;
}

export interface SourcePluginStudioDraft {
  id: string;
  name: string;
  pluginId: string;
  version: string;
  hosts: string[];
  capabilities: SourceDataCapability[];
  selectors: SourcePluginStudioSelectors;
  files: Record<string, string>;
  revision?: number;
  artifactChecksum?: string;
  builtRevision?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PluginStudioDraftRepository {
  create(draft: SourcePluginStudioDraft): Promise<SourcePluginStudioDraft>;
  findById(id: string): Promise<SourcePluginStudioDraft | undefined>;
  list(): Promise<SourcePluginStudioDraft[]>;
  update(
    id: string,
    patch: Partial<Omit<SourcePluginStudioDraft, 'id' | 'createdAt'>>,
    expectedRevision?: number
  ): Promise<SourcePluginStudioDraft>;
  remove(id: string): Promise<void>;
}
