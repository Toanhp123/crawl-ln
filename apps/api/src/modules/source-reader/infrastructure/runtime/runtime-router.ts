import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { ExternalPluginSupervisorPort } from '../../application/ports/external-plugin-supervisor.port.js';
import type {
  PluginInvocation,
  PluginRuntimePort
} from '../../application/ports/plugin-runtime.port.js';
import type { PluginOperationResult } from '../../domain/plugin/source-plugin.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import { InProcessPluginRuntime } from './in-process/in-process-plugin.runtime.js';

export class RuntimeRouter implements PluginRuntimePort {
  constructor(
    private readonly inProcess: InProcessPluginRuntime,
    private readonly external: ExternalPluginSupervisorPort,
    private readonly defaultTimeoutMs: number
  ) {}

  async invoke(invocation: PluginInvocation): Promise<PluginOperationResult<unknown>> {
    if (
      invocation.registration.packagePath ||
      invocation.registration.trustLevel === 'local-unverified' ||
      invocation.registration.executionMode === 'isolated'
    ) {
      if (!invocation.registration.packagePath) {
        throw new SourceReaderError('PLUGIN_UNAVAILABLE', 'External plugin path is missing', {
          retryable: false,
          fallbackAllowed: true
        });
      }
      const manifest = invocation.registration.plugin.manifest;
      const handle = await this.external.start({
        pluginId: manifest.id,
        pluginVersion: manifest.version,
        packageRoot: invocation.registration.packagePath,
        entryPath: join(invocation.registration.packagePath, 'dist/index.js')
      });
      return (await handle.request(
        {
          requestId: randomUUID(),
          operation: 'invokeCapability',
          deadlineAt: new Date(Date.now() + this.defaultTimeoutMs).toISOString(),
          payload: {
            capability: invocation.capability,
            request: invocation.request,
            context: {
              now: invocation.context.clock.now(),
              normalizedUrl: String(invocation.request.url ?? ''),
              browserAvailable: Boolean(invocation.context.browser)
            }
          }
        },
        invocation.context.signal,
        { context: invocation.context }
      )) as PluginOperationResult<unknown>;
    }
    return this.inProcess.invoke(invocation);
  }
}
