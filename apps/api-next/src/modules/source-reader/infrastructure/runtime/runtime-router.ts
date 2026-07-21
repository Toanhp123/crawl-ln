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

const MIN_TIMEOUT_MS = 1;
const MAX_TIMEOUT_MS = 120_000;

export class RuntimeRouter implements PluginRuntimePort {
  constructor(
    private readonly inProcess: InProcessPluginRuntime,
    private readonly external: ExternalPluginSupervisorPort,
    private readonly defaultTimeoutMs: number
  ) {}

  async invoke(invocation: PluginInvocation): Promise<PluginOperationResult<unknown>> {
    const timeoutMs = this.timeout(invocation.timeoutMs);
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
          deadlineAt: new Date(Date.now() + timeoutMs).toISOString(),
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
    return this.invokeInProcess(invocation, timeoutMs);
  }

  private async invokeInProcess(
    invocation: PluginInvocation,
    timeoutMs: number
  ): Promise<PluginOperationResult<unknown>> {
    if (invocation.context.signal.aborted) {
      throw new SourceReaderError('SOURCE_READER_CANCELLED', 'Request cancelled', {
        retryable: false,
        fallbackAllowed: false
      });
    }

    const controller = new AbortController();
    const cancelError = new SourceReaderError('SOURCE_READER_CANCELLED', 'Request cancelled', {
      retryable: false,
      fallbackAllowed: false
    });
    const timeoutError = new SourceReaderError(
      'SOURCE_REQUEST_TIMEOUT',
      'Plugin invocation timed out',
      { retryable: true, fallbackAllowed: true }
    );
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    const boundary = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        controller.abort(cancelError);
        reject(cancelError);
      };
      invocation.context.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);
    });
    const operation = this.inProcess.invoke({
      ...invocation,
      timeoutMs,
      context: { ...invocation.context, signal: controller.signal }
    });

    try {
      return await Promise.race([operation, boundary]);
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) invocation.context.signal.removeEventListener('abort', onAbort);
    }
  }

  private timeout(value: number | undefined): number {
    const candidate = Number.isFinite(value) ? Math.trunc(value!) : this.defaultTimeoutMs;
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, candidate));
  }
}
