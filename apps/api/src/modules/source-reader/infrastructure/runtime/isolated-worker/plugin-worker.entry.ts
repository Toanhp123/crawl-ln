import { pathToFileURL } from 'node:url';
import { parentPort } from 'node:worker_threads';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

if (!parentPort) throw new Error('Plugin worker requires parentPort');

Object.defineProperty(process, 'env', {
  value: Object.freeze({}),
  writable: false,
  configurable: false,
  enumerable: true
});
Object.defineProperty(globalThis, 'fetch', {
  value: undefined,
  writable: false,
  configurable: false
});

const methodByCapability: Record<string, string> = {
  identify: 'identify',
  metadata: 'readMetadata',
  'chapter-list': 'readChapterList',
  'chapter-content': 'readChapterContent',
  search: 'search',
  'latest-updates': 'latestUpdates',
  authentication: 'authenticate'
};

function createRpcContext(
  invocationId: string,
  initial: { now: string; normalizedUrl: string }
): Readonly<Record<string, unknown>> {
  let sequence = 0;
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();

  const onMessage = (message: WorkerRequest) => {
    if (message.type !== 'context-result' || message.invocationId !== invocationId) return;
    const deferred = pending.get(message.callId);
    if (!deferred) return;
    pending.delete(message.callId);
    if (message.ok) deferred.resolve(message.value);
    else deferred.reject(Object.assign(new Error(message.error.message), message.error));
  };
  parentPort!.on('message', onMessage);

  const call = (
    service: 'http' | 'html' | 'url' | 'cache' | 'logger',
    method: string,
    args: unknown[]
  ) => {
    const callId = `${invocationId}:${++sequence}`;
    return new Promise<unknown>((resolve, reject) => {
      pending.set(callId, { resolve, reject });
      parentPort!.postMessage({
        type: 'context-call',
        invocationId,
        callId,
        service,
        method,
        args
      } satisfies WorkerResponse);
    });
  };

  return Object.freeze({
    http: Object.freeze({
      get: (url: string, options?: unknown) => call('http', 'get', [url, options])
    }),
    html: Object.freeze({
      text: (source: string, selector: string) => call('html', 'text', [source, selector]),
      attr: (source: string, selector: string, name: string) =>
        call('html', 'attr', [source, selector, name]),
      html: (source: string, selector: string) => call('html', 'html', [source, selector])
    }),
    url: Object.freeze({
      normalize: (value: string) => call('url', 'normalize', [value]),
      resolve: (value: string, base: string) => call('url', 'resolve', [value, base])
    }),
    cache: Object.freeze({
      get: (key: string) => call('cache', 'get', [key]),
      set: (key: string, value: unknown, ttlMs: number) => call('cache', 'set', [key, value, ttlMs])
    }),
    logger: Object.freeze({
      info: (message: string, fields?: unknown) => call('logger', 'info', [message, fields]),
      warn: (message: string, fields?: unknown) => call('logger', 'warn', [message, fields])
    }),
    clock: Object.freeze({ now: () => initial.now }),
    signal: Object.freeze({ aborted: false }),
    normalizedUrl: initial.normalizedUrl
  });
}

parentPort.on('message', async (message: WorkerRequest) => {
  if (message.type !== 'invoke') return;
  try {
    const imported = (await import(pathToFileURL(message.pluginPath).href)) as {
      default?: unknown;
    };
    const context = createRpcContext(message.invocationId, message.context);
    const exported = imported.default;
    const plugin =
      typeof exported === 'function'
        ? await (exported as (context: unknown) => unknown)(context)
        : exported;
    if (!plugin || typeof plugin !== 'object') throw new Error('Plugin default export is invalid');
    const methodName = methodByCapability[message.capability];
    if (!methodName) throw new Error(`Unsupported capability ${message.capability}`);
    const method = (plugin as Record<string, unknown>)[methodName];
    if (typeof method !== 'function') throw new Error(`Missing ${methodName}`);
    const value = await (method as (request: Record<string, unknown>, context: unknown) => unknown)(
      message.request,
      context
    );
    parentPort!.postMessage({
      type: 'result',
      invocationId: message.invocationId,
      ok: true,
      value
    } satisfies WorkerResponse);
  } catch (error) {
    parentPort!.postMessage({
      type: 'result',
      invocationId: message.invocationId,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
        ...((error as { code?: unknown })?.code &&
        typeof (error as { code?: unknown }).code === 'string'
          ? { code: (error as { code: string }).code }
          : {})
      }
    } satisfies WorkerResponse);
  }
});
