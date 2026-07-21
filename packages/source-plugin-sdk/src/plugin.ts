import type { SourceCapability } from './capabilities.js';
import type { ExternalPluginContext } from './context.js';
import type {
  AuthExecutionResult,
  ChapterContent,
  ChapterSummary,
  LatestUpdate,
  NovelMetadata,
  NovelSearchResult,
  Page,
  PluginOperationResult,
  SourceIdentity
} from './models.js';

export type Awaitable<T> = T | Promise<T>;

export interface IdentifyRequest {
  url: string;
}

export interface ReadMetadataRequest {
  url: string;
}

export interface ReadChapterListRequest {
  url: string;
  cursor?: string;
  limit: number;
}

export interface ReadChapterContentRequest {
  url: string;
}

export interface SearchSourceRequest {
  url: string;
  query: string;
  cursor?: string;
  limit: number;
}

export interface LatestUpdatesRequest {
  url: string;
  cursor?: string;
  limit: number;
}

export interface ExternalProbeRequest {
  normalizedUrl: string;
  domain: string;
  capability: SourceCapability;
}

export interface ExternalLoginRequest {
  strategy: 'custom';
  fields: Record<string, string>;
  routeIdentity: string;
}

export interface ExternalResumeChallengeRequest {
  challengeType: string;
  response: Record<string, string>;
  opaqueState: Record<string, unknown>;
  routeIdentity: string;
}

export interface PluginLifecycleContext {
  pluginId: string;
  pluginVersion: string;
  protocolVersion: number;
  now: string;
}

export type PluginShutdownReason = 'upgrade' | 'disable' | 'quarantine' | 'application-stop';

export interface PluginHealthResult {
  status: 'healthy' | 'degraded';
  details?: Record<string, string>;
}

export interface ExternalSourcePlugin {
  initialize?(request: PluginLifecycleContext, context: ExternalPluginContext): Awaitable<void>;
  healthCheck?(
    request: Record<string, never>,
    context: ExternalPluginContext
  ): Awaitable<PluginHealthResult>;
  shutdown?(
    request: { reason: PluginShutdownReason },
    context: ExternalPluginContext
  ): Awaitable<void>;
  probeCanHandle?(
    request: ExternalProbeRequest,
    context: ExternalPluginContext
  ): Awaitable<boolean>;
  login?(
    request: ExternalLoginRequest,
    context: ExternalPluginContext
  ): Awaitable<AuthExecutionResult>;
  resumeChallenge?(
    request: ExternalResumeChallengeRequest,
    context: ExternalPluginContext
  ): Awaitable<AuthExecutionResult>;
  identify?(
    request: IdentifyRequest,
    context: ExternalPluginContext
  ): Awaitable<PluginOperationResult<SourceIdentity>>;
  readMetadata?(
    request: ReadMetadataRequest,
    context: ExternalPluginContext
  ): Awaitable<PluginOperationResult<NovelMetadata>>;
  readChapterList?(
    request: ReadChapterListRequest,
    context: ExternalPluginContext
  ): Awaitable<PluginOperationResult<Page<ChapterSummary>>>;
  readChapterContent?(
    request: ReadChapterContentRequest,
    context: ExternalPluginContext
  ): Awaitable<PluginOperationResult<ChapterContent>>;
  search?(
    request: SearchSourceRequest,
    context: ExternalPluginContext
  ): Awaitable<PluginOperationResult<Page<NovelSearchResult>>>;
  latestUpdates?(
    request: LatestUpdatesRequest,
    context: ExternalPluginContext
  ): Awaitable<PluginOperationResult<Page<LatestUpdate>>>;
}

export type ExternalSourcePluginFactory = (
  context: ExternalPluginContext
) => Awaitable<ExternalSourcePlugin>;

export interface InvokeCapabilityPayload {
  capability: Exclude<SourceCapability, 'authentication'>;
  request: Record<string, unknown>;
  context?: {
    now?: string;
    normalizedUrl?: string;
    browserAvailable?: boolean;
  };
}

export type InvokeCapability = (
  payload: InvokeCapabilityPayload,
  context: ExternalPluginContext
) => Awaitable<PluginOperationResult<unknown>>;

export function defineSourcePlugin<T extends ExternalSourcePlugin>(plugin: T): T {
  return plugin;
}
