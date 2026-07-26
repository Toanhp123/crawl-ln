import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type {
  BrowserRuntimePort,
  BrowserSecretHandle,
  BrowserSessionHandle,
  BrowserSessionIdentity
} from '../../application/ports/browser-runtime.port.js';
import type { SourceReaderInvalidationEvent } from '../../application/ports/source-reader-invalidation.port.js';
import type { SourceRequestGatePort } from '../../application/ports/source-request-gate.port.js';
import type { BrowserCommand, BrowserCommandPayload, BrowserEvent } from './browser-protocol.js';

interface BrowserCoordinatorOptions {
  browserExecutablePath?: string;
  credentialResolver?: (handle: BrowserSecretHandle) => Promise<string>;
  maxLifetimeMs?: number;
  maxNavigations?: number;
  commandTimeoutMs?: number;
  requestGate?: Pick<SourceRequestGatePort, 'enter'>;
}

export function browserSessionIdentityKey(identity: BrowserSessionIdentity): string {
  return JSON.stringify([
    identity.userId ?? null,
    identity.pluginId,
    identity.pluginVersion ?? null,
    identity.sourceAccountId,
    identity.credentialId ?? null,
    identity.sessionId ?? null,
    identity.networkRouteId ?? null,
    identity.networkIdentity ?? null
  ]);
}

function workerEntry(): URL {
  if (!import.meta.url.endsWith('.ts')) {
    return new URL('./browser-worker.entry.js', import.meta.url);
  }
  const entry = new URL('./browser-worker.entry.ts', import.meta.url).href;
  const tsxApi = import.meta.resolve('tsx/esm/api');
  const bootstrap = `import { register } from ${JSON.stringify(
    tsxApi
  )}; register(); await import(${JSON.stringify(entry)});`;
  return new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`);
}

class WorkerBackedBrowserSession implements BrowserSessionHandle {
  readonly id = randomUUID();
  private readonly worker: Worker;
  private readonly pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void; timeout: NodeJS.Timeout }
  >();
  private readonly ready: Promise<void>;
  private lifetime: NodeJS.Timeout;
  private navigations = 0;
  private closed = false;

  constructor(
    private readonly input: {
      allowedHosts: string[];
      signal: AbortSignal;
      browserExecutablePath?: string;
      route: Parameters<BrowserRuntimePort['open']>[0]['route'];
      credentialResolver?: (handle: BrowserSecretHandle) => Promise<string>;
      maxLifetimeMs: number;
      maxNavigations: number;
      commandTimeoutMs: number;
      onClosed(): void;
    }
  ) {
    this.worker = new Worker(workerEntry(), {
      execArgv: [],
      workerData: {
        browserExecutablePath: input.browserExecutablePath,
        allowedHosts: input.allowedHosts,
        route: input.route
      },
      resourceLimits: {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 64,
        stackSizeMb: 8
      }
    });
    this.ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Browser worker initialization timed out')),
        input.commandTimeoutMs
      );
      const onReady = (message: BrowserEvent) => {
        if (message.type !== 'ready') return;
        clearTimeout(timeout);
        this.worker.off('message', onReady);
        resolve();
      };
      this.worker.on('message', onReady);
      this.worker.once('error', reject);
    });
    this.worker.on('message', (message: BrowserEvent) => void this.onMessage(message));
    this.worker.once('error', (error) => this.failAll(error));
    this.worker.once('exit', (code) => {
      if (!this.closed && code !== 0) {
        this.failAll(new Error(`Browser worker exited with code ${code}`));
      }
    });
    this.input.signal.addEventListener('abort', () => void this.close(), { once: true });
    this.lifetime = setTimeout(() => void this.close(), input.maxLifetimeMs);
  }

  async open(url: string): Promise<void> {
    if (++this.navigations > this.input.maxNavigations) {
      throw new Error('Browser session navigation limit exceeded');
    }
    await this.command({ operation: 'open', url });
  }

  async waitFor(selector: string): Promise<void> {
    await this.command({ operation: 'wait-for', selector });
  }

  async text(selector: string): Promise<string | null> {
    return (await this.command({ operation: 'text', selector })) as string | null;
  }

  async html(selector: string): Promise<string | null> {
    return (await this.command({ operation: 'html', selector })) as string | null;
  }

  async click(selector: string): Promise<void> {
    await this.command({ operation: 'click', selector });
  }

  async fillSecret(selector: string, handle: BrowserSecretHandle): Promise<void> {
    await this.command({ operation: 'fill-secret', selector, handle });
  }

  async cookies(): Promise<Array<Record<string, unknown>>> {
    return (await this.command({ operation: 'cookies' })) as Array<Record<string, unknown>>;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.lifetime);
    try {
      await this.command({ operation: 'close' }, true);
    } catch {
      // Termination below is authoritative cleanup.
    }
    this.failAll(new Error('Browser session closed'));
    await this.worker.terminate().catch(() => undefined);
    this.input.onClosed();
  }

  private async command(payload: BrowserCommandPayload, allowClosed = false): Promise<unknown> {
    if (this.closed && !allowClosed) throw new Error('Browser session is closed');
    if (this.input.signal.aborted && !allowClosed) throw new Error('Browser session was cancelled');
    await this.ready;
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser command timed out: ${payload.operation}`));
      }, this.input.commandTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.worker.postMessage({ type: 'command', id, ...payload } as BrowserCommand);
    });
  }

  private async onMessage(message: BrowserEvent): Promise<void> {
    if (message.type === 'resolve-secret') {
      try {
        if (!this.input.credentialResolver) throw new Error('Credential resolver is unavailable');
        const value = await this.input.credentialResolver(message.handle);
        this.worker.postMessage({
          type: 'secret-result',
          requestId: message.requestId,
          ok: true,
          value
        } satisfies BrowserCommand);
      } catch (error) {
        this.worker.postMessage({
          type: 'secret-result',
          requestId: message.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        } satisfies BrowserCommand);
      }
      return;
    }
    if (message.type !== 'result') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.ok) pending.resolve(message.value);
    else pending.reject(new Error(message.error));
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export class RequestGatedBrowserSession implements BrowserSessionHandle {
  constructor(
    private readonly delegate: BrowserSessionHandle,
    private readonly requestGate: Pick<SourceRequestGatePort, 'enter'>,
    private readonly signal: AbortSignal
  ) {}

  get id(): string {
    return this.delegate.id;
  }

  async open(url: string): Promise<void> {
    await this.requestGate.enter(url, this.signal);
    await this.delegate.open(url);
  }

  waitFor(selector: string): Promise<void> {
    return this.delegate.waitFor(selector);
  }

  text(selector: string): Promise<string | null> {
    return this.delegate.text(selector);
  }

  html(selector: string): Promise<string | null> {
    return this.delegate.html(selector);
  }

  click(selector: string): Promise<void> {
    return this.delegate.click(selector);
  }

  fillSecret(selector: string, secretHandle: BrowserSecretHandle): Promise<void> {
    return this.delegate.fillSecret(selector, secretHandle);
  }

  cookies(): Promise<Array<Record<string, unknown>>> {
    return this.delegate.cookies();
  }

  close(): Promise<void> {
    return this.delegate.close();
  }
}

export class BrowserRuntimeCoordinator implements BrowserRuntimePort {
  private readonly sessions = new Map<
    string,
    { identity: BrowserSessionIdentity; session: BrowserSessionHandle }
  >();

  constructor(private readonly options: BrowserCoordinatorOptions = {}) {}

  async open(input: Parameters<BrowserRuntimePort['open']>[0]): Promise<BrowserSessionHandle> {
    const key = browserSessionIdentityKey(input.identity);
    const existing = this.sessions.get(key);
    if (existing) return existing.session;
    const workerSession = new WorkerBackedBrowserSession({
      allowedHosts: input.allowedHosts,
      signal: input.signal,
      browserExecutablePath: this.options.browserExecutablePath,
      route: input.route,
      credentialResolver:
        input.identity.credentialId && this.options.credentialResolver
          ? async (handle) => {
              if (handle.credentialId !== input.identity.credentialId) {
                throw new Error('Browser secret handle is outside the approved credential scope');
              }
              return this.options.credentialResolver!(handle);
            }
          : undefined,
      maxLifetimeMs: this.options.maxLifetimeMs ?? 10 * 60_000,
      maxNavigations: this.options.maxNavigations ?? 50,
      commandTimeoutMs: this.options.commandTimeoutMs ?? 30_000,
      onClosed: () => this.sessions.delete(key)
    });
    const session = this.options.requestGate
      ? new RequestGatedBrowserSession(workerSession, this.options.requestGate, input.signal)
      : workerSession;
    this.sessions.set(key, { identity: input.identity, session });
    return session;
  }

  async closeByIdentity(identity: BrowserSessionIdentity): Promise<void> {
    await this.sessions.get(browserSessionIdentityKey(identity))?.session.close();
  }

  async closeMatching(event: SourceReaderInvalidationEvent): Promise<number> {
    const matching = [...this.sessions.values()].filter(({ identity }) => {
      switch (event.type) {
        case 'credential-updated':
        case 'credential-deleted':
        case 'logout':
          return identity.credentialId === event.credentialId;
        case 'session-revoked':
          return identity.sessionId === event.sessionId;
        case 'network-profile-updated':
        case 'network-profile-deleted':
          return (
            identity.networkRouteId === event.networkIdentity ||
            identity.networkIdentity === event.networkIdentity
          );
        case 'plugin-activated':
        case 'plugin-upgraded':
        case 'plugin-disabled':
        case 'plugin-quarantined':
          return (
            identity.pluginId === event.pluginId &&
            (!event.pluginVersion || identity.pluginVersion === event.pluginVersion)
          );
        case 'chapter-list-version-changed':
          return false;
      }
    });
    await Promise.all(matching.map(({ session }) => session.close()));
    return matching.length;
  }
}
