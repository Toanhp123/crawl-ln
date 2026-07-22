import { join } from 'node:path';
import type { ClockPort } from '../../ports/runtime-support.ports.js';
import type { ExternalPluginSupervisorPort } from '../../ports/external-plugin-supervisor.port.js';
import type {
  PluginRegistryPort,
  PreparedPluginRegistrySnapshot,
  RegisteredPlugin
} from '../../ports/plugin-registry.port.js';
import type { PluginStorePort, StoredPluginVersion } from '../../ports/plugin-store.port.js';
import { SourceReaderError } from '../../../domain/errors/source-reader.error.js';
import type { ExternalPluginRegistrationFactory } from './external-plugin-registration.factory.js';
import type {
  PluginActivationResult,
  PluginShutdownReason
} from '../../../domain/plugin/plugin-lifecycle.js';

interface ActivationStore extends Pick<
  PluginStorePort,
  | 'findVersion'
  | 'findActive'
  | 'permissionsApproved'
  | 'activateCandidateAtomically'
  | 'restoreActivation'
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
    private readonly registrationFactory: ExternalPluginRegistrationFactory,
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
      const previousRegistry = this.registry.snapshot();
      const prepared = this.registry.prepareRegistration(
        previousRegistry,
        await this.registrationFactory.create(candidate)
      );
      phase = 'publish';
      const publishedAt = this.clock.now().toISOString();
      await this.store.activateCandidateAtomically(
        candidate.pluginId,
        candidate.version,
        publishedAt
      );
      try {
        this.registry.publishPrepared(prepared);
      } catch (error) {
        this.restoreRegistry(previousRegistry);
        await this.store.restoreActivation(candidate.pluginId, previous?.version, publishedAt);
        throw error;
      }
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
    const previousRegistry = this.registry.snapshot();
    await this.store.disable(pluginId);
    try {
      this.publishWithout(pluginId, previousRegistry);
    } catch (error) {
      if (previous) {
        await this.store.restoreActivation(
          pluginId,
          previous.version,
          this.clock.now().toISOString()
        );
      }
      this.restoreRegistry(previousRegistry);
      throw error;
    }
    if (previous) await this.shutdownVersion(previous, 'disable').catch(() => undefined);
  }

  async quarantine(pluginId: string, version: string, reason: string): Promise<void> {
    const previous = await this.store.findActive(pluginId);
    const removesActiveVersion = previous?.version === version;
    const previousRegistry = this.registry.snapshot();
    await this.store.quarantine(pluginId, version, reason);
    if (!removesActiveVersion) return;
    try {
      this.publishWithout(pluginId, previousRegistry);
    } catch (error) {
      await this.store.restoreActivation(
        pluginId,
        previous.version,
        this.clock.now().toISOString()
      );
      this.restoreRegistry(previousRegistry);
      throw error;
    }
    await this.shutdownVersion(previous, 'quarantine').catch(() => undefined);
  }

  async stopAll(): Promise<void> {
    for (const version of await this.store.listActive()) {
      await this.shutdownVersion(version, 'application-stop').catch(() => undefined);
    }
  }

  private publishWithout(
    pluginId: string,
    snapshot: ReadonlyMap<string, RegisteredPlugin> = this.registry.snapshot()
  ): void {
    const next = new Map(snapshot);
    next.delete(pluginId);
    this.registry.publishPrepared({ registrations: next } as PreparedPluginRegistrySnapshot);
  }

  private restoreRegistry(snapshot: ReadonlyMap<string, RegisteredPlugin>): void {
    try {
      this.registry.publishPrepared({
        registrations: new Map(snapshot)
      } as PreparedPluginRegistrySnapshot);
    } catch {
      // Best-effort rollback. The original lifecycle error remains the primary failure.
    }
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
