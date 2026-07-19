import { join } from 'node:path';
import type {
  PluginInvocation,
  PluginRuntimePort
} from '../../application/ports/plugin-runtime.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import { InProcessPluginRuntime } from './in-process/in-process-plugin.runtime.js';
import { IsolatedWorkerPluginRuntime } from './isolated-worker/isolated-worker-plugin.runtime.js';

export class RuntimeRouter implements PluginRuntimePort {
  constructor(
    private readonly inProcess: InProcessPluginRuntime,
    private readonly isolated: IsolatedWorkerPluginRuntime
  ) {}

  invoke(invocation: PluginInvocation) {
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
      return this.isolated.invokeExternal({
        pluginPath: join(invocation.registration.packagePath, 'dist/index.js'),
        manifest: invocation.registration.plugin.manifest,
        capability: invocation.capability,
        request: invocation.request,
        context: invocation.context
      });
    }
    return this.inProcess.invoke(invocation);
  }
}
