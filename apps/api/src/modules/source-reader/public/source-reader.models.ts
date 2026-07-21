import type {
  ChapterContent,
  ChapterSummary,
  IdentifyRequest as PluginIdentifyRequest,
  LatestUpdate,
  LatestUpdatesRequest as PluginLatestUpdatesRequest,
  NovelMetadata,
  NovelSearchResult,
  Page,
  ReadChapterContentRequest as PluginReadChapterContentRequest,
  ReadChapterListRequest as PluginReadChapterListRequest,
  ReadMetadataRequest as PluginReadMetadataRequest,
  SearchSourceRequest as PluginSearchSourceRequest,
  SourceCapability,
  SourceIdentity,
  SourceReaderWarning,
  VersionedExtensionValue
} from '@novel-tool/source-plugin-sdk';

export type {
  CacheScope,
  ChapterContent,
  ChapterSummary,
  LatestUpdate,
  NovelMetadata,
  NovelSearchResult,
  Page,
  SourceCapability,
  SourceIdentity,
  SourceReaderWarning,
  VersionedExtensionValue
} from '@novel-tool/source-plugin-sdk';

export interface SourceReaderRequestContext {
  requestId?: string;
  userId?: string;
  credentialProfileId?: string;
  networkProfileId?: string;
  freshOnly?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface IdentifyRequest extends SourceReaderRequestContext, PluginIdentifyRequest {}

export interface ReadMetadataRequest
  extends SourceReaderRequestContext, PluginReadMetadataRequest {}

export interface ReadChapterListRequest
  extends SourceReaderRequestContext, Omit<PluginReadChapterListRequest, 'limit'> {
  limit?: number;
}

export interface StreamChapterListRequest extends SourceReaderRequestContext {
  url: string;
  batchSize?: number;
}

export interface ReadChapterContentRequest
  extends SourceReaderRequestContext, PluginReadChapterContentRequest {}

export interface SearchSourceRequest
  extends SourceReaderRequestContext, Omit<PluginSearchSourceRequest, 'limit'> {
  limit?: number;
}

export interface LatestUpdatesRequest
  extends SourceReaderRequestContext, Omit<PluginLatestUpdatesRequest, 'limit'> {
  limit?: number;
}

export interface SourceReaderResult<TData> {
  data: TData;
  source: {
    pluginId: string;
    pluginVersion: string;
    domain: string;
    capability: SourceCapability;
  };
  extensions?: Record<string, VersionedExtensionValue>;
  warnings?: SourceReaderWarning[];
}

export type SourceReaderData =
  | SourceIdentity
  | NovelMetadata
  | Page<ChapterSummary>
  | ChapterContent
  | Page<NovelSearchResult>
  | Page<LatestUpdate>;
