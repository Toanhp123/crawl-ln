import 'ses';
import { ModuleSource } from '@endo/module-source';
import { isSandboxFrameWithinBounds } from './sandbox-frame-bounds.mjs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

lockdown({ errorTaming: 'safe', stackFiltering: 'concise', consoleTaming: 'safe' });

const protocolVersion = 1;
const packageRoot = await realpath(process.env.SOURCE_READER_PLUGIN_ROOT ?? '');
const entryPath = await realpath(process.env.SOURCE_READER_PLUGIN_ENTRY ?? '');
const cancelled = new Set();
const pendingHostCalls = new Map();
let hostCallSequence = 0;

const isInside = (candidate) => {
  const rel = relative(packageRoot, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
};

const policyError = (message) =>
  Object.assign(new Error(message), { code: 'PLUGIN_SANDBOX_POLICY_VIOLATION' });

const locate = async (specifier, referrer = pathToFileURL(entryPath).href) => {
  if (
    specifier.startsWith('node:') ||
    (!specifier.startsWith('.') && !specifier.startsWith('file:'))
  ) {
    throw policyError(`Forbidden module specifier: ${specifier}`);
  }
  const base = specifier.startsWith('file:')
    ? fileURLToPath(specifier)
    : fileURLToPath(new URL(specifier, referrer));
  const candidates = [base, `${base}.js`, `${base}.mjs`, resolve(base, 'index.js')];
  for (const candidate of candidates) {
    let actual;
    try {
      actual = await realpath(candidate);
      const candidateStat = await stat(actual);
      if (!candidateStat.isFile()) continue;
    } catch {
      continue;
    }
    if (!isInside(actual)) throw policyError('Module escapes verified package root');
    const extension = extname(actual).toLowerCase();
    if (!['.js', '.mjs', '.json'].includes(extension)) throw policyError('Forbidden module type');
    return pathToFileURL(actual).href;
  }
  throw Object.assign(new Error(`Module not found: ${specifier}`), { code: 'MODULE_NOT_FOUND' });
};

const protocolError = () =>
  Object.assign(new Error('Sandbox RPC frame is invalid'), {
    code: 'PLUGIN_RPC_PROTOCOL_INVALID'
  });

const sendFrame = (frame) => {
  if (!isSandboxFrameWithinBounds(frame)) throw protocolError();
  process.send?.(frame);
};

const hostCall = (requestId, service, method, args = []) => {
  const callId = `${requestId}:${++hostCallSequence}`;
  return new Promise((resolveCall, rejectCall) => {
    pendingHostCalls.set(callId, { resolve: resolveCall, reject: rejectCall });
    try {
      sendFrame({
        protocolVersion,
        type: 'host-call',
        requestId,
        callId,
        service,
        method,
        args
      });
    } catch (error) {
      pendingHostCalls.delete(callId);
      rejectCall(error);
    }
  });
};

const createContext = (requestId, payload) => {
  const contextData = payload.context && typeof payload.context === 'object' ? payload.context : {};
  const call = (service, method, args) => hostCall(requestId, service, method, args);
  const signal = {};
  Object.defineProperty(signal, 'aborted', {
    enumerable: true,
    get: () => cancelled.has(requestId)
  });
  return harden({
    http: harden({ get: (url, options) => call('http', 'get', [url, options]) }),
    html: harden({
      load: (source) => {
        const documentId = call('html', 'load', [source]);
        const documentCall = async (method, args = []) =>
          call('html', method, [await documentId, ...args]);
        const nodeProxy = (nodeId) =>
          harden({
            text: (selector) =>
              selector === undefined
                ? call('html', 'nodeText', [nodeId])
                : call('html', 'nodeText', [nodeId, selector]),
            attr: (name) => call('html', 'nodeAttr', [nodeId, name]),
            html: (selector) =>
              selector === undefined
                ? call('html', 'nodeHtml', [nodeId])
                : call('html', 'nodeHtml', [nodeId, selector])
          });
        return harden({
          text: (selector) => documentCall('text', [selector]),
          attr: (selector, name) => documentCall('attr', [selector, name]),
          html: (selector) => documentCall('html', [selector]),
          all: async (selector) =>
            (await documentCall('all', [selector])).map((nodeId) => nodeProxy(nodeId)),
          remove: (selector) => documentCall('remove', [selector])
        });
      }
    }),
    url: harden({
      normalize: (value) => call('url', 'normalize', [value]),
      resolve: (value, base) => call('url', 'resolve', [value, base])
    }),
    cache: harden({
      get: (key) => call('cache', 'get', [key]),
      set: (key, value, ttlMs) => call('cache', 'set', [key, value, ttlMs])
    }),
    ...(contextData.browserAvailable === true
      ? {
          browser: harden({
            open: (url) => call('browser', 'open', [url]),
            waitFor: (selector) => call('browser', 'waitFor', [selector]),
            text: (selector) => call('browser', 'text', [selector]),
            html: (selector) => call('browser', 'html', [selector]),
            click: (selector) => call('browser', 'click', [selector]),
            fillSecret: (selector, handle) => call('browser', 'fillSecret', [selector, handle]),
            cookies: () => call('browser', 'cookies', [])
          })
        }
      : {}),
    logger: harden({
      info: (message, metadata) => call('logger', 'info', [message, metadata]),
      warn: (message, metadata) => call('logger', 'warn', [message, metadata])
    }),
    clock: harden({ now: () => String(contextData.now ?? '') }),
    host: harden({ clockNow: () => call('clock', 'now', []) }),
    signal: harden(signal),
    normalizedUrl: String(contextData.normalizedUrl ?? '')
  });
};

const formatConsoleOutput = (args) =>
  `${args.map((value) => (typeof value === 'string' ? value : String(value))).join(' ')}\n`;
const pluginConsole = harden({
  log: (...args) => process.stdout.write(formatConsoleOutput(args)),
  info: (...args) => process.stdout.write(formatConsoleOutput(args)),
  warn: (...args) => process.stderr.write(formatConsoleOutput(args)),
  error: (...args) => process.stderr.write(formatConsoleOutput(args))
});

const compartment = new Compartment({
  name: `source-reader:${process.env.SOURCE_READER_PLUGIN_ID ?? 'unknown'}`,
  globals: harden({ console: pluginConsole, URL, URLSearchParams }),
  resolveHook: (specifier, referrer) => new URL(specifier, referrer).href,
  importHook: async (specifier) => {
    const location = await locate(specifier);
    const extension = extname(fileURLToPath(location)).toLowerCase();
    const text = await readFile(fileURLToPath(location), 'utf8');
    return {
      source: new ModuleSource(extension === '.json' ? `export default ${text};` : text, {
        sourceUrl: location
      })
    };
  },
  __options__: true
});

const { namespace } = await compartment.import(pathToFileURL(entryPath).href);

const methodByCapability = harden(JSON.parse(process.env.SOURCE_READER_CAPABILITY_METHODS ?? '{}'));

const execute = async (frame) => {
  const context = createContext(frame.requestId, frame.payload);
  if (frame.operation === 'invokeCapability' && typeof namespace.invokeCapability === 'function') {
    return namespace.invokeCapability(frame.payload, context);
  }
  const exported = namespace.default;
  const plugin = typeof exported === 'function' ? await exported(context) : exported;
  if (!plugin || typeof plugin !== 'object') throw new Error('Plugin default export is invalid');
  if (frame.operation === 'invokeCapability') {
    const capability = String(frame.payload.capability ?? '');
    const methodName = methodByCapability[capability];
    const method = plugin[methodName];
    if (typeof method !== 'function') throw new Error(`Missing ${methodName}`);
    return method(frame.payload.request ?? {}, context);
  }
  const operationMethod = plugin[frame.operation];
  if (typeof operationMethod !== 'function') throw new Error(`Missing ${frame.operation}`);
  return operationMethod(frame.payload, context);
};

process.on('message', async (frame) => {
  if (!frame || frame.protocolVersion !== protocolVersion || typeof frame.type !== 'string') return;
  if (frame.type === 'cancel') {
    cancelled.add(frame.requestId);
    return;
  }
  if (frame.type === 'host-result') {
    const pending = pendingHostCalls.get(frame.callId);
    if (!pending) return;
    pendingHostCalls.delete(frame.callId);
    if (frame.ok) pending.resolve(frame.value);
    else
      pending.reject(
        Object.assign(new Error(frame.error?.message ?? 'Host call failed'), frame.error)
      );
    return;
  }
  if (frame.type !== 'request') return;
  try {
    const value = await execute(frame);
    sendFrame({
      protocolVersion,
      type: 'response',
      requestId: frame.requestId,
      ok: true,
      value
    });
  } catch (error) {
    sendFrame({
      protocolVersion,
      type: 'response',
      requestId: frame.requestId,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
        ...(typeof error?.code === 'string' ? { code: error.code } : {})
      }
    });
  } finally {
    cancelled.delete(frame.requestId);
  }
});

sendFrame({ protocolVersion, type: 'hello' });
