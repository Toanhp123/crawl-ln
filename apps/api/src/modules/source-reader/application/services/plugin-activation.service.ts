import { join } from 'node:path';
import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { ExternalPluginSupervisorPort } from '../ports/external-plugin-supervisor.port.js';
import type {
  PluginRegistryPort,
  PreparedPluginRegistrySnapshot,
  RegisteredPlugin
} from '../ports/plugin-registry.port.js';
import type { PluginStorePort, StoredPluginVersion } from '../ports/plugin-store.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import { loadActivatedExtensionContracts } from './plugin-extension-validator.js';
import type {
  PluginActivationResult,
  PluginLifecycle,
  PluginShutdownReason
} from '../../domain/plugin/plugin-lifecycle.js';

interface ActivationStore extends Pick<
  PluginStorePort,
  | 'findVersion'
  | 'findActive'
  | 'permissionsApproved'
  | 'activateCandidateAtomically'
  | 'recordActivationFailure'
  | 'disable'
  | 'quarantine'
  | 'listActive'
> {}

interface ActivationRegistry extends Pick<
  PluginRegistryPort,
  'snapshot' | 'prepareRegistration' | 'publishPrepared' | 'findById'
> {}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function lifecycleError(phase: string, error: unknown): SourceReaderError {
  return new SourceReaderError('PLUGIN_LIFECYCLE_FAILED', `Plugin ${phase} failed`, {
    retryable: false,
    fallbackAllowed: false,
    cause: error,
    details: { phase }
  });
}

export class PluginActivationService {
  constructor(
    private readonly store: ActivationStore,
    private readonly registry: ActivationRegistry,
    private readonly supervisor: ExternalPluginSupervisorPort,
    private readonly clock: ClockPort,
    private readonly ids: { randomId(): string },
    private readonly timeoutMs: number
  ) {}

  async activate(input: {
    pluginId: string;
    version: string;
    signal: AbortSignal;
  }): Promise<PluginActivationResult> {
    const candidate = await this.store.findVersion(input.pluginId, input.version);
    if (!candidate) {
      throw new SourceReaderError('PLUGIN_UNAVAILABLE', 'Plugin version is unavailable', {
        retryable: false,
        fallbackAllowed: false,
        details: { pluginId: input.pluginId, version: input.version }
      });
    }
    const fatalCompatibility = candidate.compatibilityIssues?.find(
      (issue) => issue.severity === 'fatal'
    );
    if (fatalCompatibility) {
      throw new SourceReaderError(fatalCompatibility.code, fatalCompatibility.message, {
        retryable: false,
        fallbackAllowed: false,
        details: { path: fatalCompatibility.path }
      });
    }

    if (!(await this.store.permissionsApproved(input.pluginId, input.version))) {
      throw new SourceReaderError(
        'PLUGIN_PERMISSION_DENIED',
        'Plugin permissions are not approved',
        {
          retryable: false,
          fallbackAllowed: false
        }
      );
    }

    const previous = await this.store.findActive(input.pluginId);
    const handle = await this.supervisor.start({
      pluginId: candidate.pluginId,
      pluginVersion: candidate.version,
      packageRoot: candidate.packagePath,
      entryPath: join(candidate.packagePath, 'dist/index.js')
    });
    let phase = 'initialize';
    try {
      await handle.request(
        {
          requestId: this.ids.randomId(),
          operation: 'initialize',
          deadlineAt: this.deadline(),
          payload: {
            pluginId: candidate.pluginId,
            pluginVersion: candidate.version,
            protocolVersion: 1,
            now: this.clock.now().toISOString()
          }
        },
        input.signal
      );
      phase = 'healthCheck';
      const health = (await handle.request(
        {
          requestId: this.ids.randomId(),
          operation: 'healthCheck',
          deadlineAt: this.deadline(),
          payload: {}
        },
        input.signal
      )) as { status?: unknown };
      if (health?.status !== 'healthy') throw new Error('Candidate health check is not healthy');
      phase = 'registry';
      const activatedExtensionContracts = await loadActivatedExtensionContracts(
        candidate.packagePath,
        candidate.activatedExtensions ?? {}
      );
      const prepared = this.registry.prepareRegistration(
        this.registry.snapshot(),
        this.registration(candidate, this.lifecycleProxy(candidate), activatedExtensionContracts)
      );
      phase = 'publish';
      await this.store.activateCandidateAtomically(
        candidate.pluginId,
        candidate.version,
        this.clock.now().toISOString()
      );
      this.registry.publishPrepared(prepared);
    } catch (error) {
      await handle.terminate('activation-failed').catch(() => undefined);
      await this.store.recordActivationFailure({
        pluginId: candidate.pluginId,
        version: candidate.version,
        phase,
        message: safeMessage(error)
      });
      throw lifecycleError(phase, error);
    }

    const warnings: PluginActivationResult['warnings'] = [];
    if (previous && previous.version !== candidate.version) {
      try {
        await this.shutdownVersion(previous, 'upgrade');
      } catch (error) {
        warnings.push({ code: 'PLUGIN_LIFECYCLE_FAILED', message: safeMessage(error) });
      }
    }
    return {
      pluginId: candidate.pluginId,
      version: candidate.version,
      status: 'active',
      warnings
    };
  }

  async disable(pluginId: string): Promise<void> {
    const previous = await this.store.findActive(pluginId);
    this.publishWithout(pluginId);
    await this.store.disable(pluginId);
    if (previous) await this.shutdownVersion(previous, 'disable').catch(() => undefined);
  }

  async quarantine(pluginId: string, version: string, reason: string): Promise<void> {
    const previous = await this.store.findActive(pluginId);
    this.publishWithout(pluginId);
    await this.store.quarantine(pluginId, version, reason);
    if (previous?.version === version) {
      await this.shutdownVersion(previous, 'quarantine').catch(() => undefined);
    }
  }

  async stopAll(): Promise<void> {
    for (const version of await this.store.listActive()) {
      await this.shutdownVersion(version, 'application-stop').catch(() => undefined);
    }
  }

  private publishWithout(pluginId: string): void {
    const next = new Map(this.registry.snapshot());
    next.delete(pluginId);
    this.registry.publishPrepared({ registrations: next } as PreparedPluginRegistrySnapshot);
  }

  private registration(
    version: StoredPluginVersion,
    lifecycle: PluginLifecycle,
    activatedExtensionContracts: RegisteredPlugin['activatedExtensionContracts']
  ): RegisteredPlugin {
    return {
      plugin: {
        manifest: {
          ...version.manifest,
          extensionContracts: version.activatedExtensions ?? {}
        },
        lifecycle
      },
      trustLevel: version.trustLevel,
      executionMode: 'isolated',
      enabled: true,
      packagePath: version.packagePath,
      activatedExtensionContracts
    };
  }

  private lifecycleProxy(version: StoredPluginVersion): PluginLifecycle {
    return {
      initialize: async (context) => {
        const handle = await this.handleFor(version);
        await handle.request(
          {
            requestId: this.ids.randomId(),
            operation: 'initialize',
            deadlineAt: this.deadline(),
            payload: { ...context }
          },
          new AbortController().signal
        );
      },
      healthCheck: async () => {
        const handle = await this.handleFor(version);
        return (await handle.request(
          {
            requestId: this.ids.randomId(),
            operation: 'healthCheck',
            deadlineAt: this.deadline(),
            payload: {}
          },
          new AbortController().signal
        )) as { status: 'healthy' | 'degraded'; details?: Record<string, string> };
      },
      shutdown: async (reason) => this.shutdownVersion(version, reason)
    };
  }

  private async handleFor(version: StoredPluginVersion) {
    return (
      this.supervisor.get(version.pluginId, version.version) ??
      this.supervisor.start({
        pluginId: version.pluginId,
        pluginVersion: version.version,
        packageRoot: version.packagePath,
        entryPath: join(version.packagePath, 'dist/index.js')
      })
    );
  }

  private async shutdownVersion(
    version: StoredPluginVersion,
    reason: PluginShutdownReason
  ): Promise<void> {
    const handle = this.supervisor.get(version.pluginId, version.version);
    if (!handle) return;
    try {
      await handle.request(
        {
          requestId: this.ids.randomId(),
          operation: 'shutdown',
          deadlineAt: this.deadline(),
          payload: { reason }
        },
        new AbortController().signal
      );
    } finally {
      await this.supervisor.stop(version.pluginId, version.version, reason);
    }
  }

  private deadline(): string {
    return new Date(this.clock.now().getTime() + this.timeoutMs).toISOString();
  }
}
