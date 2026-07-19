export const SOURCE_PLUGIN_API_VERSION = 2;
export type ChapterPreview = {
  index: number;
  title: string;
  url: string;
};

export type AnalyzeNovelResult = {
  title: string;
  sourceUrl: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  chapters: ChapterPreview[];
  diagnostics?: {
    chapterCount: number;
    firstChapterUrls: string[];
  };
};

export type ChapterContentResult = {
  title: string;
  url: string;
  rawText: string;
  cleanText: string;
};

export type SourcePluginCapability = 'metadata' | 'chapters' | 'search' | 'cover';
export type SourcePluginStatus = 'active' | 'disabled' | 'invalid' | 'api_mismatch' | 'failed';

export type SourcePluginManifest = {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  priority: number;
  match: string[];
  capabilities: SourcePluginCapability[];
  entry?: string;
};

export type SourcePluginHealth = {
  successCount: number;
  failureCount: number;
  averageLatencyMs: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
};

export type SourcePluginDescriptor = {
  manifest: SourcePluginManifest;
  status: SourcePluginStatus;
  enabled: boolean;
  health: SourcePluginHealth;
  loadedAt?: string;
  error?: string;
};

export type SourcePluginImplementation = {
  canHandle?(url: string): boolean | Promise<boolean>;
  analyze(url: string): Promise<AnalyzeNovelResult>;
  fetchChapter(url: string, signal?: AbortSignal): Promise<ChapterContentResult>;
};

export type PluginHttpResponse = {
  url: string;
  status: number;
  headers: Record<string, string>;
  data: string;
};
export type PluginHtmlDocument = {
  text(selector: string): string;
  attr(selector: string, name: string): string | undefined;
  html(selector: string): string;
  all(
    selector: string
  ): Array<{ text(selector?: string): string; attr(name: string): string | undefined }>;
  remove(selector: string): void;
};

export type SourcePluginContext = {
  http: {
    get(
      url: string,
      options?: { headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal }
    ): Promise<PluginHttpResponse>;
  };
  html: { load(source: string): PluginHtmlDocument };
  logger: {
    info(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
  };
  clock: { now(): string };
};

export type SourcePluginFactory = (
  context: SourcePluginContext
) => SourcePluginImplementation | Promise<SourcePluginImplementation>;
