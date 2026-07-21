import type {
  ChapterContent,
  ChapterSummary,
  IdentifyRequest,
  LatestUpdate,
  LatestUpdatesRequest,
  NovelMetadata,
  NovelSearchResult,
  Page,
  ReadChapterContentRequest,
  ReadChapterListRequest,
  ReadMetadataRequest,
  SearchSourceRequest,
  SourceIdentity,
  SourceReaderResult,
  StreamChapterListRequest
} from './source-reader.models.js';

export interface SourceReaderApi {
  identify(request: IdentifyRequest): Promise<SourceReaderResult<SourceIdentity>>;
  readMetadata(request: ReadMetadataRequest): Promise<SourceReaderResult<NovelMetadata>>;
  readChapterList(
    request: ReadChapterListRequest
  ): Promise<SourceReaderResult<Page<ChapterSummary>>>;
  streamChapterList(
    request: StreamChapterListRequest
  ): AsyncIterable<SourceReaderResult<ChapterSummary[]>>;
  readChapterContent(
    request: ReadChapterContentRequest
  ): Promise<SourceReaderResult<ChapterContent>>;
  search(request: SearchSourceRequest): Promise<SourceReaderResult<Page<NovelSearchResult>>>;
  latestUpdates(request: LatestUpdatesRequest): Promise<SourceReaderResult<Page<LatestUpdate>>>;
}

export interface SourceReaderPluginDiagnostics {
  pluginId: string;
  activeVersion?: string;
  status: string;
  lifecycleState: string;
  runtimeVersion: string;
  sandboxProtocolVersion: number;
  compatibilityIssues: Array<{
    code: string;
    path: string;
    severity: 'warning' | 'fatal';
    message: string;
  }>;
  lastHealth?: { status: string; checkedAt: string; failureCode?: string };
  policy: { processStartTimeoutMs: number; violationThreshold: number };
}

export type SourceReaderAuthenticationResult =
  | { status: 'authenticated' }
  | {
      status: 'challenge-required';
      challenge: {
        id: string;
        type: 'otp' | 'captcha' | 'approval' | 'browser-interaction';
        expiresAt: string;
        userInstructions?: string;
      };
    };

export type SourceReaderRole = 'reader' | 'source-manager' | 'source-admin' | 'system-admin';

export interface SourceReaderActor {
  id?: string;
  roles: SourceReaderRole[];
}

export interface SourceReaderExecutor<Input, Output = unknown> {
  execute(input: Input): Promise<Output> | Output;
}

export interface SourceReaderManagementApi {
  plugins: {
    list: SourceReaderExecutor<{ actor: SourceReaderActor }, unknown[]>;
    install: SourceReaderExecutor<
      { actor: SourceReaderActor; bytes: Uint8Array; originalName: string },
      Record<string, unknown>
    >;
    approvePermissions: SourceReaderExecutor<{
      actor: SourceReaderActor;
      pluginId: string;
      version: string;
    }>;
    denyPermissions: SourceReaderExecutor<{
      actor: SourceReaderActor;
      pluginId: string;
      version: string;
    }>;
    listPermissions: SourceReaderExecutor<
      { actor: SourceReaderActor; pluginId: string },
      unknown[]
    >;
    enable: SourceReaderExecutor<{
      actor: SourceReaderActor;
      pluginId: string;
      version: string;
    }>;
    disable: SourceReaderExecutor<{ actor: SourceReaderActor; pluginId: string }>;
    remove: SourceReaderExecutor<{ actor: SourceReaderActor; pluginId: string }>;
    test: SourceReaderExecutor<{ actor: SourceReaderActor; pluginId: string }>;
    health: SourceReaderExecutor<{ actor: SourceReaderActor; pluginId: string }>;
    diagnostics: SourceReaderExecutor<
      { actor: SourceReaderActor; pluginId: string },
      SourceReaderPluginDiagnostics
    >;
  };
  credentials: {
    create: SourceReaderExecutor<{
      actor: SourceReaderActor;
      ownerType: 'system' | 'user';
      pluginId?: string;
      domain?: string;
      name: string;
      strategy: 'cookie-import' | 'bearer-token' | 'basic-auth' | 'form-login' | 'custom';
      secret: Record<string, unknown>;
    }>;
    list: SourceReaderExecutor<{ actor: SourceReaderActor }, unknown[]>;
    updateSecret: SourceReaderExecutor<{
      actor: SourceReaderActor;
      credentialId: string;
      secret: Record<string, unknown>;
    }>;
    remove: SourceReaderExecutor<{ actor: SourceReaderActor; credentialId: string }>;
    login: SourceReaderExecutor<
      { actor: SourceReaderActor; credentialId: string; networkProfileId?: string },
      SourceReaderAuthenticationResult
    >;
    logout: SourceReaderExecutor<{ actor: SourceReaderActor; credentialId: string }>;
    test: SourceReaderExecutor<
      { actor: SourceReaderActor; credentialId: string; networkProfileId?: string },
      SourceReaderAuthenticationResult
    >;
  };
  networkProfiles: {
    create: SourceReaderExecutor<{
      actor: SourceReaderActor;
      ownerType: 'system' | 'user';
      name: string;
      routeType: 'direct' | 'http-proxy' | 'https-proxy' | 'socks-proxy';
      regions: string[];
      tags: string[];
      config?: Record<string, unknown>;
    }>;
    list: SourceReaderExecutor<{ actor: SourceReaderActor }, unknown[]>;
    update: SourceReaderExecutor<{
      actor: SourceReaderActor;
      profileId: string;
      patch: Record<string, unknown>;
    }>;
    remove: SourceReaderExecutor<{ actor: SourceReaderActor; profileId: string }>;
    test: SourceReaderExecutor<{ actor: SourceReaderActor; profileId: string }>;
  };
  challenges: {
    list: SourceReaderExecutor<{ actor: SourceReaderActor }, unknown[]>;
    get: SourceReaderExecutor<{ actor: SourceReaderActor; challengeId: string }>;
    respond: SourceReaderExecutor<
      { actor: SourceReaderActor; challengeId: string; response: Record<string, unknown> },
      SourceReaderAuthenticationResult
    >;
    cancel: SourceReaderExecutor<{ actor: SourceReaderActor; challengeId: string }>;
  };
}

export type * from './source-reader.models.js';
