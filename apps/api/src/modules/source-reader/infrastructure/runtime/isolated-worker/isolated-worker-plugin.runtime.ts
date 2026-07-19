import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import type {
  PluginContext,
  PluginOperationResult,
  SourcePluginManifest
} from '../../../domain/plugin/source-plugin.js';
import { SourceReaderError } from '../../../domain/errors/source-reader.error.js';
import type { SourceCapability } from '../../../public/source-reader.models.js';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

export interface ExternalPluginInvocation {
  pluginPath: string;
  manifest: SourcePluginManifest;
  capability: SourceCapability;
  request: Record<string, unknown>;
  context: PluginContext;
  timeoutMs?: number;
}

function workerEntry(): URL {
  if (!import.meta.url.endsWith('.ts')) {
    return new URL('./plugin-worker.entry.js', import.meta.url);
  }
  const entry = new URL('./plugin-worker.entry.ts', import.meta.url).href;
  const tsxApi = import.meta.resolve('tsx/esm/api');
  const bootstrap = `import { register } from ${JSON.stringify(
    tsxApi
  )}; register(); await import(${JSON.stringify(entry)});`;
  return new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`);
}

function errorPayload(error: unknown) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    ...((error as { code?: unknown })?.code &&
    typeof (error as { code?: unknown }).code === 'string'
      ? { code: (error as { code: string }).code }
      : {})
  };
}

async function dispatchContextCall(
  worker: Worker,
  message: Extract<WorkerResponse, { type: 'context-call' }>,
  context: PluginContext
): Promise<void> {
  try {
    let value: unknown;
    const [first, second, third] = message.args;
    switch (`${message.service}.${message.method}`) {
      case 'http.get':
        value = await context.http.get(String(first), (second ?? undefined) as never);
        break;
      case 'html.text':
        value = context.html.load(String(first)).text(String(second));
        break;
      case 'html.attr':
        value = context.html.load(String(first)).attr(String(second), String(third));
        break;
      case 'html.html':
        value = context.html.load(String(first)).html(String(second));
        break;
      case 'url.normalize':
        value = context.url.normalize(String(first));
        break;
      case 'url.resolve':
        value = context.url.resolve(String(first), String(second));
        break;
      case 'cache.get':
        value = await context.cache.get(String(first));
        break;
      case 'cache.set':
        await context.cache.set(String(first), second, Number(third));
        value = undefined;
        break;
      case 'logger.info':
        context.logger.info(String(first), second as Record<string, unknown> | undefined);
        value = undefined;
        break;
      case 'logger.warn':
        context.logger.warn(String(first), second as Record<string, unknown> | undefined);
        value = undefined;
        break;
      default:
        throw new Error(`Worker context call is not allowed: ${message.service}.${message.method}`);
    }
    worker.postMessage({
      type: 'context-result',
      invocationId: message.invocationId,
      callId: message.callId,
      ok: true,
      value
    } satisfies WorkerRequest);
  } catch (error) {
    worker.postMessage({
      type: 'context-result',
      invocationId: message.invocationId,
      callId: message.callId,
      ok: false,
      error: errorPayload(error)
    } satisfies WorkerRequest);
  }
}

export class IsolatedWorkerPluginRuntime {
  constructor(private readonly options: { defaultTimeoutMs: number }) {}

  async invokeExternal(input: ExternalPluginInvocation): Promise<PluginOperationResult<unknown>> {
    if (input.context.signal.aborted) {
      throw new SourceReaderError('SOURCE_READER_CANCELLED', 'Request cancelled', {
        retryable: false,
        fallbackAllowed: false
      });
    }

    const worker = new Worker(workerEntry(), {
      execArgv: [],
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4
      }
    });
    const invocationId = randomUUID();

    return new Promise<PluginOperationResult<unknown>>((resolvePromise, rejectPromise) => {
      let settled = false;
      const finish = async (
        outcome: { ok: true; value: PluginOperationResult<unknown> } | { ok: false; error: unknown }
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        input.context.signal.removeEventListener('abort', onAbort);
        worker.removeAllListeners();
        await worker.terminate().catch(() => undefined);
        if (outcome.ok) resolvePromise(outcome.value);
        else rejectPromise(outcome.error);
      };
      const unavailable = (message: string, cause?: unknown) =>
        new SourceReaderError('PLUGIN_UNAVAILABLE', message, {
          retryable: true,
          fallbackAllowed: true,
          cause
        });
      const timeout = setTimeout(
        () => void finish({ ok: false, error: unavailable('Plugin worker timed out') }),
        input.timeoutMs ?? this.options.defaultTimeoutMs
      );
      const onAbort = () =>
        void finish({
          ok: false,
          error: new SourceReaderError('SOURCE_READER_CANCELLED', 'Request cancelled', {
            retryable: false,
            fallbackAllowed: false
          })
        });
      input.context.signal.addEventListener('abort', onAbort, { once: true });

      worker.on('message', (message: WorkerResponse) => {
        if (message.type === 'context-call') {
          void dispatchContextCall(worker, message, input.context);
          return;
        }
        if (message.type !== 'result' || message.invocationId !== invocationId) return;
        if (message.ok) {
          void finish({ ok: true, value: message.value as PluginOperationResult<unknown> });
        } else {
          void finish({ ok: false, error: unavailable(message.error.message) });
        }
      });
      worker.once('error', (error) => {
        void finish({ ok: false, error: unavailable('Plugin worker crashed', error) });
      });
      worker.once('exit', (code) => {
        if (!settled && code !== 0) {
          void finish({
            ok: false,
            error: unavailable(`Plugin worker exited unexpectedly with code ${code}`)
          });
        }
      });
      worker.postMessage({
        type: 'invoke',
        invocationId,
        pluginPath: resolve(input.pluginPath),
        capability: input.capability,
        request: input.request,
        context: {
          now: input.context.clock.now(),
          normalizedUrl: String(input.request.url ?? '')
        }
      } satisfies WorkerRequest);
    });
  }
}
