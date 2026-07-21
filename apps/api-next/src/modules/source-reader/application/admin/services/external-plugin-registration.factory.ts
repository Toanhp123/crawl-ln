import { join } from 'node:path';
import type { ExternalPluginSupervisorPort } from '../../ports/external-plugin-supervisor.port.js';
import type { RegisteredPlugin } from '../../ports/plugin-registry.port.js';
import type { StoredPluginVersion } from '../../ports/plugin-store.port.js';
import type { AuthExecutionResult } from '../../../domain/auth/authentication.js';
import type {
  ExternalLoginRequest,
  ExternalProbeRequest,
  ExternalResumeChallengeRequest
} from '../../../domain/plugin/external-auth-rpc.js';
import type { PluginLifecycle } from '../../../domain/plugin/plugin-lifecycle.js';
import type { SourceReaderPlugin } from '../../../domain/plugin/source-plugin.js';
import { loadActivatedExtensionContracts } from '../../services/plugin-extension-validator.js';

export interface ExternalPluginRegistrationFactoryOptions {
  supervisor: ExternalPluginSupervisorPort;
  timeoutMs: number;
  now(): Date;
  randomId(): string;
  protocolVersion: number;
}

export class ExternalPluginRegistrationFactory {
  constructor(private readonly options: ExternalPluginRegistrationFactoryOptions) {}

  async create(version: StoredPluginVersion): Promise<RegisteredPlugin> {
    return {
      plugin: this.plugin(version),
      trustLevel: version.trustLevel,
      executionMode:
        version.trustLevel === 'local-unverified'
          ? 'isolated'
          : version.manifest.runtime.preferredMode,
      enabled: true,
      packagePath: version.packagePath,
      activatedExtensionContracts: await loadActivatedExtensionContracts(
        version.packagePath,
        version.activatedExtensions ?? {}
      )
    };
  }

  private plugin(version: StoredPluginVersion): SourceReaderPlugin {
    const manifest = {
      ...version.manifest,
      extensionContracts: version.activatedExtensions ?? version.manifest.extensionContracts ?? {}
    };
    return {
      manifest,
      lifecycle: this.lifecycle(version),
      canHandle: async (request) =>
        Boolean(
          await this.request(version, 'probeCanHandle', {
            normalizedUrl: request.normalizedUrl,
            domain: request.domain,
            capability: request.capability
          } satisfies ExternalProbeRequest)
        ),
      ...(manifest.capabilities.includes('authentication')
        ? {
            authentication: {
              login: async (request) =>
                (await this.request(version, 'login', {
                  strategy: 'custom',
                  fields: request.fields ?? {},
                  routeIdentity: request.routeIdentity ?? 'direct'
                } satisfies ExternalLoginRequest)) as AuthExecutionResult,
              resumeChallenge: async (request) => {
                const response = Object.fromEntries(
                  Object.entries(request.response).flatMap(([key, value]) =>
                    typeof value === 'string' ? [[key, value]] : []
                  )
                );
                return (await this.request(version, 'resumeChallenge', {
                  challengeType: request.challengeType ?? 'unknown',
                  response,
                  opaqueState: request.opaqueState ?? {},
                  routeIdentity: request.routeIdentity ?? 'direct'
                } satisfies ExternalResumeChallengeRequest)) as AuthExecutionResult;
              }
            }
          }
        : {})
    };
  }

  private lifecycle(version: StoredPluginVersion): PluginLifecycle {
    return {
      initialize: async (context) => {
        await this.request(version, 'initialize', {
          ...context,
          protocolVersion: this.options.protocolVersion
        });
      },
      healthCheck: async () =>
        (await this.request(version, 'healthCheck', {})) as {
          status: 'healthy' | 'degraded';
          details?: Record<string, string>;
        },
      shutdown: async (reason) => {
        try {
          await this.request(version, 'shutdown', { reason });
        } finally {
          await this.options.supervisor.stop(version.pluginId, version.version, reason);
        }
      }
    };
  }

  private async request(
    version: StoredPluginVersion,
    operation:
      'initialize' | 'healthCheck' | 'shutdown' | 'probeCanHandle' | 'login' | 'resumeChallenge',
    payload: Record<string, unknown>
  ): Promise<unknown> {
    const handle =
      this.options.supervisor.get(version.pluginId, version.version) ??
      (await this.options.supervisor.start({
        pluginId: version.pluginId,
        pluginVersion: version.version,
        packageRoot: version.packagePath,
        entryPath: join(version.packagePath, 'dist/index.js')
      }));
    return handle.request(
      {
        requestId: this.options.randomId(),
        operation,
        deadlineAt: new Date(this.options.now().getTime() + this.options.timeoutMs).toISOString(),
        payload
      },
      new AbortController().signal
    );
  }
}
