import {
  SOURCE_CAPABILITY_METHODS,
  SOURCE_PLUGIN_ERROR_CODES,
  type SourcePluginErrorCode
} from '@novel-tool/source-plugin-sdk';
import { createHash, randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ExternalPluginHostBridge,
  ExternalPluginProcessHandle,
  ExternalPluginRequest,
  ExternalPluginSupervisorPort
} from '../../../application/ports/external-plugin-supervisor.port.js';
import { SourceReaderError } from '../../../domain/errors/source-reader.error.js';
import {
  SANDBOX_PROTOCOL_VERSION,
  type HostToSandboxFrame,
  type SandboxHostCallFrame,
  type SandboxToHostFrame
} from './sandbox-protocol.js';
import { parseHostToSandboxFrame, parseSandboxToHostFrame } from './sandbox-protocol.schema.js';
import { minimumSupportedNodeVersion, sandboxEntryPath } from './sandbox-bootstrap.js';
import { validateSandboxPackage } from './sandbox-module-loader.js';
import type { SourceReaderStructuredLogger } from '../../../application/services/source-reader-structured-logger.js';
import { OpaqueHtmlHandleStore } from './opaque-html-handle.store.js';

interface PendingRequest {
  host?: ExternalPluginHostBridge;
  htmlHandles?: OpaqueHtmlHandleStore;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timer: NodeJS.Timeout;
  signal: AbortSignal;
  onAbort(): void;
}

interface OutputPolicyViolation {
  pluginId: string;
  pluginVersion: string;
  stream: 'stdout' | 'stderr';
  bytes: number;
}

interface SupervisorOptions {
  startupTimeoutMs: number;
  cancelGraceMs: number;
  structuredLogger?: SourceReaderStructuredLogger;
  onOutputPolicyViolation?(input: OutputPolicyViolation): Promise<void> | void;
}

function key(pluginId: string, pluginVersion: string): string {
  return `${pluginId}@${pluginVersion}`;
}

const sourcePluginErrorCodes = new Set<string>(SOURCE_PLUGIN_ERROR_CODES);

const sourcePluginErrorPolicy = {
  AUTHENTICATION_REQUIRED: { retryable: false, fallbackAllowed: false },
  AUTHENTICATION_FAILED: { retryable: false, fallbackAllowed: false },
  NETWORK_ACCESS_BLOCKED: { retryable: false, fallbackAllowed: true },
  SOURCE_RESPONSE_TOO_LARGE: { retryable: false, fallbackAllowed: true },
  SOURCE_RATE_LIMITED: { retryable: true, fallbackAllowed: true },
  SOURCE_TEMPORARILY_UNAVAILABLE: { retryable: true, fallbackAllowed: true },
  UPSTREAM_CHALLENGE_DETECTED: { retryable: true, fallbackAllowed: true },
  CURSOR_INVALID: { retryable: false, fallbackAllowed: false },
  PLUGIN_RESULT_INVALID: { retryable: false, fallbackAllowed: true },
  SOURCE_READER_CANCELLED: { retryable: false, fallbackAllowed: false }
} as const satisfies Record<
  SourcePluginErrorCode,
  { retryable: boolean; fallbackAllowed: boolean }
>;

function safeError(error: unknown): { name: string; message: string; code?: string } {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
    ...(typeof (error as { code?: unknown })?.code === 'string'
      ? { code: (error as { code: string }).code }
      : {})
  };
}

async function dispatchHostCall(
  child: ChildProcess,
  frame: SandboxHostCallFrame,
  pending: PendingRequest | undefined
): Promise<void> {
  const context = pending?.host?.context;
  try {
    const [first, second, third] = frame.args;
    let value: unknown;
    switch (`${frame.service}.${frame.method}`) {
      case 'clock.now':
        value = context?.clock.now() ?? new Date().toISOString();
        break;
      case 'http.get':
        if (!context) throw new Error('HTTP host context is unavailable');
        value = await context.http.get(String(first), (second ?? undefined) as never);
        break;
      case 'html.load':
        if (!pending?.htmlHandles) throw new Error('HTML host context is unavailable');
        value = pending.htmlHandles.load(String(first));
        break;
      case 'html.text':
        if (!pending?.htmlHandles) throw new Error('HTML host context is unavailable');
        value = pending.htmlHandles.text(String(first), String(second));
        break;
      case 'html.attr':
        if (!pending?.htmlHandles) throw new Error('HTML host context is unavailable');
        value = pending.htmlHandles.attr(String(first), String(second), String(third));
        break;
      case 'html.html':
        if (!pending?.htmlHandles) throw new Error('HTML host context is unavailable');
        value = pending.htmlHandles.html(String(first), String(second));
        break;
      case 'html.all':
        if (!pending?.htmlHandles) throw new Error('HTML host context is unavailable');
        value = pending.htmlHandles.all(String(first), String(second));
        break;
      case 'html.remove':
        if (!pending?.htmlHandles) throw new Error('HTML host context is unavailable');
        pending.htmlHandles.remove(String(first), String(second));
        value = undefined;
        break;
      case 'html.nodeText':
        if (!pending?.htmlHandles) throw new Error('HTML host context is unavailable');
        value = pending.htmlHandles.nodeText(
          String(first),
          typeof second === 'string' ? second : undefined
        );
        break;
      case 'html.nodeAttr':
        if (!pending?.htmlHandles) throw new Error('HTML host context is unavailable');
        value = pending.htmlHandles.nodeAttr(String(first), String(second));
        break;
      case 'html.nodeHtml':
        if (!pending?.htmlHandles) throw new Error('HTML host context is unavailable');
        value = pending.htmlHandles.nodeHtml(
          String(first),
          typeof second === 'string' ? second : undefined
        );
        break;
      case 'url.normalize':
        if (!context) throw new Error('URL host context is unavailable');
        value = context.url.normalize(String(first));
        break;
      case 'url.resolve':
        if (!context) throw new Error('URL host context is unavailable');
        value = context.url.resolve(String(first), String(second));
        break;
      case 'cache.get':
        if (!context) throw new Error('Cache host context is unavailable');
        value = await context.cache.get(String(first));
        break;
      case 'cache.set':
        if (!context) throw new Error('Cache host context is unavailable');
        await context.cache.set(String(first), second, Number(third));
        value = undefined;
        break;
      case 'logger.info':
        if (!context) throw new Error('Logger host context is unavailable');
        context.logger.info(String(first), second as Record<string, unknown> | undefined);
        value = undefined;
        break;
      case 'logger.warn':
        if (!context) throw new Error('Logger host context is unavailable');
        context.logger.warn(String(first), second as Record<string, unknown> | undefined);
        value = undefined;
        break;
      case 'browser.open':
        if (!context?.browser) throw new Error('Browser host context is unavailable');
        await context.browser.open(String(first));
        value = undefined;
        break;
      case 'browser.waitFor':
        if (!context?.browser) throw new Error('Browser host context is unavailable');
        await context.browser.waitFor(String(first));
        value = undefined;
        break;
      case 'browser.text':
        if (!context?.browser) throw new Error('Browser host context is unavailable');
        value = await context.browser.text(String(first));
        break;
      case 'browser.html':
        if (!context?.browser) throw new Error('Browser host context is unavailable');
        value = await context.browser.html(String(first));
        break;
      case 'browser.click':
        if (!context?.browser) throw new Error('Browser host context is unavailable');
        await context.browser.click(String(first));
        value = undefined;
        break;
      case 'browser.fillSecret':
        if (!context?.browser) throw new Error('Browser host context is unavailable');
        await context.browser.fillSecret(
          String(first),
          second as { credentialId: string; field: string }
        );
        value = undefined;
        break;
      case 'browser.cookies':
        if (!context?.browser) throw new Error('Browser host context is unavailable');
        value = await context.browser.cookies();
        break;
      default:
        throw new Error(`Sandbox host call is not allowed: ${frame.service}.${frame.method}`);
    }
    send(child, {
      protocolVersion: SANDBOX_PROTOCOL_VERSION,
      type: 'host-result',
      requestId: frame.requestId,
      callId: frame.callId,
      ok: true,
      value
    });
  } catch (error) {
    send(child, {
      protocolVersion: SANDBOX_PROTOCOL_VERSION,
      type: 'host-result',
      requestId: frame.requestId,
      callId: frame.callId,
      ok: false,
      error: safeError(error)
    });
  }
}

function send(child: ChildProcess, frame: HostToSandboxFrame): void {
  const parsed = parseHostToSandboxFrame(frame);
  if (!parsed.success) {
    throw new SourceReaderError('PLUGIN_RPC_PROTOCOL_INVALID', 'Sandbox RPC frame is invalid', {
      retryable: false,
      fallbackAllowed: false
    });
  }
  child.send?.(parsed.data);
}

class ExternalProcessHandle implements ExternalPluginProcessHandle {
  readonly pending = new Map<string, PendingRequest>();
  private terminated = false;

  constructor(
    readonly pluginId: string,
    readonly pluginVersion: string,
    private readonly child: ChildProcess,
    private readonly cancelGraceMs: number,
    private readonly onTerminated: () => void
  ) {
    child.on('message', (value: unknown) => this.onMessage(value));
    child.once('error', (error) => this.failAll(this.unavailable('Plugin sandbox crashed', error)));
    child.once('exit', (code, signal) => {
      this.terminated = true;
      this.onTerminated();
      this.failAll(this.unavailable(`Plugin sandbox exited (${code ?? signal ?? 'unknown'})`));
    });
  }

  async request(
    request: ExternalPluginRequest,
    signal: AbortSignal,
    host?: ExternalPluginHostBridge
  ): Promise<unknown> {
    if (this.terminated || !this.child.connected) {
      throw this.unavailable('Plugin sandbox is unavailable');
    }
    const parsed = parseHostToSandboxFrame({
      protocolVersion: SANDBOX_PROTOCOL_VERSION,
      type: 'request',
      ...request
    });
    if (!parsed.success) {
      throw new SourceReaderError('PLUGIN_RPC_PROTOCOL_INVALID', 'Sandbox request is invalid', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    if (signal.aborted) {
      await this.terminate('request-cancelled');
      throw new SourceReaderError('SOURCE_READER_CANCELLED', 'Request cancelled', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    const timeoutMs = Math.max(0, Date.parse(request.deadlineAt) - Date.now());
    return new Promise((resolveRequest, rejectRequest) => {
      const completeAfterTermination = async (error: SourceReaderError, reason: string) => {
        const pending = this.pending.get(request.requestId);
        if (!pending) return;
        pending.htmlHandles?.release();
        this.pending.delete(request.requestId);
        send(this.child, {
          protocolVersion: SANDBOX_PROTOCOL_VERSION,
          type: 'cancel',
          requestId: request.requestId,
          reason
        });
        await new Promise((resolveGrace) => setTimeout(resolveGrace, this.cancelGraceMs));
        await this.terminate(reason);
        rejectRequest(error);
      };
      const timer = setTimeout(
        () =>
          void completeAfterTermination(
            new SourceReaderError('SOURCE_REQUEST_TIMEOUT', 'Plugin sandbox request timed out', {
              retryable: true,
              fallbackAllowed: true
            }),
            'request-timeout'
          ),
        timeoutMs
      );
      const onAbort = () =>
        void completeAfterTermination(
          new SourceReaderError('SOURCE_READER_CANCELLED', 'Request cancelled', {
            retryable: false,
            fallbackAllowed: false
          }),
          'request-cancelled'
        );
      this.pending.set(request.requestId, {
        host,
        ...(host?.context ? { htmlHandles: new OpaqueHtmlHandleStore(host.context.html) } : {}),
        resolve: resolveRequest,
        reject: rejectRequest,
        timer,
        signal,
        onAbort
      });
      signal.addEventListener('abort', onAbort, { once: true });
      send(this.child, parsed.data);
    });
  }

  async terminate(reason: string): Promise<void> {
    if (this.terminated) return;
    this.terminated = true;
    this.onTerminated();
    if (this.child.connected) this.child.disconnect();
    this.child.kill('SIGKILL');
    await new Promise<void>((resolveExit) => {
      if (this.child.exitCode !== null || this.child.signalCode !== null) {
        resolveExit();
        return;
      }
      const timer = setTimeout(resolveExit, 500);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
    this.failAll(this.unavailable(`Plugin sandbox terminated: ${reason}`));
  }

  private onMessage(value: unknown): void {
    const parsed = parseSandboxToHostFrame(value);
    if (!parsed.success) {
      void this.terminate('invalid-rpc-frame');
      this.failAll(
        new SourceReaderError('PLUGIN_RPC_PROTOCOL_INVALID', 'Sandbox response is invalid', {
          retryable: false,
          fallbackAllowed: false
        })
      );
      return;
    }
    const frame = parsed.data as SandboxToHostFrame;
    if (frame.type === 'hello') return;
    const pending = this.pending.get(frame.requestId);
    if (frame.type === 'host-call') {
      void dispatchHostCall(this.child, frame, pending);
      return;
    }
    if (!frame.ok && frame.error?.code === 'PLUGIN_RPC_PROTOCOL_INVALID') {
      this.failAll(
        new SourceReaderError('PLUGIN_RPC_PROTOCOL_INVALID', 'Sandbox response is invalid', {
          retryable: false,
          fallbackAllowed: false
        })
      );
      void this.terminate('invalid-rpc-frame');
      return;
    }
    if (!pending) return;
    this.pending.delete(frame.requestId);
    pending.htmlHandles?.release();
    clearTimeout(pending.timer);
    pending.signal.removeEventListener('abort', pending.onAbort);
    if (frame.ok) pending.resolve(frame.value);
    else pending.reject(this.pluginFailure(frame.error));
  }

  private failAll(error: unknown): void {
    for (const pending of this.pending.values()) {
      pending.htmlHandles?.release();
      clearTimeout(pending.timer);
      pending.signal.removeEventListener('abort', pending.onAbort);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private pluginFailure(error: { message: string; code?: string } | undefined): SourceReaderError {
    const message = (error?.message ?? 'Plugin sandbox failed').slice(0, 1_000);
    if (error?.code && sourcePluginErrorCodes.has(error.code)) {
      const code = error.code as SourcePluginErrorCode;
      return new SourceReaderError(code, message, sourcePluginErrorPolicy[code]);
    }
    return this.unavailable(message);
  }

  private unavailable(message: string, cause?: unknown): SourceReaderError {
    return new SourceReaderError('PLUGIN_UNAVAILABLE', message, {
      retryable: true,
      fallbackAllowed: true,
      cause,
      details: { pluginId: this.pluginId, pluginVersion: this.pluginVersion }
    });
  }
}

export class ExternalProcessSupervisor implements ExternalPluginSupervisorPort {
  private readonly handles = new Map<string, ExternalProcessHandle>();

  constructor(private readonly options: SupervisorOptions) {}

  async start(input: {
    pluginId: string;
    pluginVersion: string;
    packageRoot: string;
    entryPath: string;
  }): Promise<ExternalPluginProcessHandle> {
    const existing = this.handles.get(key(input.pluginId, input.pluginVersion));
    if (existing) return existing;
    this.assertNodeVersion();
    const verified = await validateSandboxPackage(input);
    const entry = sandboxEntryPath();
    const frameBounds = resolve(dirname(entry), 'sandbox-frame-bounds.mjs');
    const repositoryNodeModules = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../../../../../node_modules'
    );
    const child = fork(entry, [], {
      execArgv: [
        '--permission',
        '--max-old-space-size=128',
        `--allow-fs-read=${entry}`,
        `--allow-fs-read=${frameBounds}`,
        `--allow-fs-read=${verified.packageRoot}`,
        `--allow-fs-read=${repositoryNodeModules}`,
        '--disable-proto=delete'
      ],
      env: {
        PATH: process.env.PATH ?? '',
        LANG: process.env.LANG ?? 'C.UTF-8',
        LC_ALL: process.env.LC_ALL ?? 'C.UTF-8',
        NODE_NO_WARNINGS: '1',
        SOURCE_READER_PLUGIN_ID: input.pluginId,
        SOURCE_READER_PLUGIN_VERSION: input.pluginVersion,
        SOURCE_READER_PLUGIN_ROOT: verified.packageRoot,
        SOURCE_READER_PLUGIN_ENTRY: verified.entryPath,
        SOURCE_READER_CAPABILITY_METHODS: JSON.stringify(SOURCE_CAPABILITY_METHODS)
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });

    const captureOutput = (stream: 'stdout' | 'stderr', chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const event = {
        pluginId: input.pluginId,
        pluginVersion: input.pluginVersion,
        stream,
        bytes: bytes.length
      } satisfies OutputPolicyViolation;
      this.options.structuredLogger?.host('source_reader.plugin_output_policy_violation', {
        pluginId: input.pluginId,
        pluginVersion: input.pluginVersion,
        stream,
        bytes: bytes.length,
        previewHash: createHash('sha256').update(bytes).digest('hex').slice(0, 16)
      });
      Promise.resolve(this.options.onOutputPolicyViolation?.(event)).catch(() => undefined);
    };
    child.stdout?.on('data', (chunk: Buffer | string) => captureOutput('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer | string) => captureOutput('stderr', chunk));

    const handle = new ExternalProcessHandle(
      input.pluginId,
      input.pluginVersion,
      child,
      this.options.cancelGraceMs,
      () => this.handles.delete(key(input.pluginId, input.pluginVersion))
    );
    this.handles.set(key(input.pluginId, input.pluginVersion), handle);

    try {
      await new Promise<void>((resolveReady, rejectReady) => {
        const timer = setTimeout(
          () => rejectReady(new Error('Sandbox startup timed out')),
          this.options.startupTimeoutMs
        );
        const onMessage = (value: unknown) => {
          const parsed = parseSandboxToHostFrame(value);
          if (parsed.success && parsed.data.type === 'hello') {
            clearTimeout(timer);
            child.off('message', onMessage);
            resolveReady();
          }
        };
        child.on('message', onMessage);
        child.once('error', (error) => {
          clearTimeout(timer);
          rejectReady(error);
        });
        child.once('exit', (code, signal) => {
          clearTimeout(timer);
          rejectReady(new Error(`Sandbox exited during startup (${code ?? signal ?? 'unknown'})`));
        });
      });
      return handle;
    } catch (error) {
      await handle.terminate('startup-failed');
      throw new SourceReaderError('PLUGIN_SANDBOX_START_FAILED', 'Plugin sandbox failed to start', {
        retryable: true,
        fallbackAllowed: true,
        cause: error,
        details: { pluginId: input.pluginId, pluginVersion: input.pluginVersion }
      });
    }
  }

  get(pluginId: string, pluginVersion: string): ExternalPluginProcessHandle | undefined {
    return this.handles.get(key(pluginId, pluginVersion));
  }

  async stop(pluginId: string, pluginVersion: string, reason: string): Promise<void> {
    await this.handles.get(key(pluginId, pluginVersion))?.terminate(reason);
  }

  private assertNodeVersion(): void {
    const [major, minor] = process.versions.node.split('.').map(Number);
    const required = minimumSupportedNodeVersion();
    if (major < required.major || (major === required.major && minor < required.minor)) {
      throw new SourceReaderError(
        'EXTERNAL_RUNTIME_UNSUPPORTED',
        'External plugins require Node.js 22.12 or newer',
        { retryable: false, fallbackAllowed: false }
      );
    }
  }
}
