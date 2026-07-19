import { watch, type FSWatcher } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { HttpClientPort } from '../../../../shared/ports/http-client.port.js';
import type {
  HtmlDocumentPort,
  HtmlParserPort
} from '../../../../shared/ports/html-parser.port.js';
import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { LoggerPort } from '../../../../shared/ports/logger.port.js';
import type {
  SourcePluginHandle,
  SourcePluginRegistryPort
} from '../../application/ports/source-plugin-registry.port.js';
import {
  SOURCE_PLUGIN_API_VERSION,
  type PluginHtmlDocument,
  type SourcePluginContext,
  type SourcePluginDescriptor,
  type SourcePluginFactory,
  type SourcePluginHealth,
  type SourcePluginImplementation,
  type SourcePluginManifest
} from '../../domain/source-plugin.js';

const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  version: z.string().min(1),
  apiVersion: z.number().int(),
  priority: z.number().int().default(0),
  match: z.array(z.string().min(1)).min(1),
  capabilities: z
    .array(z.enum(['metadata', 'chapters', 'search', 'cover']))
    .default(['metadata', 'chapters']),
  entry: z.string().default('index.js')
});

const FAILURE_COOLDOWN_MS = 60_000;

const forbiddenSource = [
  /(^|\s)import\s/m,
  /import\s*\(/,
  /require\s*\(/,
  /\bprocess\b/,
  /node:fs|child_process|worker_threads/,
  /\beval\s*\(/,
  /new\s+Function\s*\(/
];

type Loaded = {
  directory: string;
  descriptor: SourcePluginDescriptor;
  implementation?: SourcePluginImplementation;
  handle?: SourcePluginHandle;
};

function emptyHealth(): SourcePluginHealth {
  return { successCount: 0, failureCount: 0, averageLatencyMs: 0 };
}
function hostMatches(url: string, patterns: string[]) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return patterns.some(
      (pattern) => host === pattern.toLowerCase() || host.endsWith(`.${pattern.toLowerCase()}`)
    );
  } catch {
    return false;
  }
}
function wrapDocument(document: HtmlDocumentPort): PluginHtmlDocument {
  return {
    text: (selector) => document.text(selector),
    attr: (selector, name) => document.attr(selector, name),
    html: (selector) => document.html(selector),
    remove: (selector) => document.remove(selector),
    all: (selector) =>
      document.queryAll(selector).map((node) => ({
        text: (childSelector?: string) =>
          childSelector ? document.nodeText(node, childSelector) : document.nodeText(node),
        attr: (name) => document.nodeAttr(node, name)
      }))
  };
}

export class DynamicSourcePluginRegistry implements SourcePluginRegistryPort {
  private loaded = new Map<string, Loaded>();
  private watcher?: FSWatcher;
  private reloadTimer?: NodeJS.Timeout;
  private enabled = new Map<string, boolean>();
  private stateLoaded = false;
  private reloadInFlight?: Promise<SourcePluginDescriptor[]>;
  private reloadRequested = false;
  constructor(
    private readonly sourcesDir: string,
    private readonly stateFile: string,
    private readonly http: HttpClientPort,
    private readonly parser: HtmlParserPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort
  ) {}

  list() {
    return [...this.loaded.values()]
      .map((item) => structuredClone(item.descriptor))
      .sort(
        (a, b) =>
          b.manifest.priority - a.manifest.priority ||
          a.manifest.name.localeCompare(b.manifest.name)
      );
  }
  handles() {
    return [...this.loaded.values()]
      .filter((item) => ['active', 'failed'].includes(item.descriptor.status) && item.handle)
      .sort((a, b) => b.descriptor.manifest.priority - a.descriptor.manifest.priority)
      .map((item) => item.handle!);
  }
  async start() {
    await mkdir(this.sourcesDir, { recursive: true });
    await this.reload();
    this.watcher = watch(this.sourcesDir, { recursive: true }, () => {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => this.requestReload(), 250);
    });
  }
  async stop() {
    clearTimeout(this.reloadTimer);
    this.watcher?.close();
    this.watcher = undefined;
  }
  async setEnabled(id: string, enabled: boolean) {
    if (!this.loaded.has(id)) throw new Error(`Unknown source plugin: ${id}`);
    this.enabled.set(id, enabled);
    await this.saveState();
    await this.reload();
    return this.loaded.get(id)!.descriptor;
  }
  async reload(): Promise<SourcePluginDescriptor[]> {
    this.reloadRequested = true;
    if (this.reloadInFlight) return this.reloadInFlight;
    this.reloadInFlight = (async () => {
      let result = this.list();
      while (this.reloadRequested) {
        this.reloadRequested = false;
        result = await this.performReload();
      }
      return result;
    })().finally(() => {
      this.reloadInFlight = undefined;
    });
    return this.reloadInFlight;
  }
  private requestReload() {
    void this.reload().catch((error) => {
      this.logger.error(
        `Plugin reload failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
      );
    });
  }
  private async performReload(): Promise<SourcePluginDescriptor[]> {
    if (!this.stateLoaded) await this.loadState();
    await mkdir(this.sourcesDir, { recursive: true });
    const next = new Map<string, Loaded>();
    const entries = (await readdir(this.sourcesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const loaded = await this.loadOne(join(this.sourcesDir, entry.name));
      const id = loaded.descriptor.manifest.id;
      const duplicate = next.get(id);
      if (duplicate) {
        next.set(id, {
          directory: duplicate.directory,
          descriptor: {
            ...duplicate.descriptor,
            status: 'invalid',
            error: `Duplicate plugin id ${id}: ${duplicate.directory}, ${loaded.directory}`
          }
        });
        continue;
      }
      next.set(id, loaded);
    }
    this.loaded = next;
    return this.list();
  }
  private async loadOne(directory: string): Promise<Loaded> {
    let manifest: SourcePluginManifest = {
      id: directory.split(/[\\/]/).pop() ?? 'invalid',
      name: 'Invalid plugin',
      version: '0',
      apiVersion: 0,
      priority: 0,
      match: ['invalid.local'],
      capabilities: []
    };
    try {
      const manifestPath = join(directory, 'manifest.json');
      manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
      const enabled = this.enabled.get(manifest.id) ?? true;
      if (!enabled)
        return {
          directory,
          descriptor: {
            manifest,
            enabled: false,
            status: 'disabled',
            health: this.previousHealth(manifest.id)
          }
        };
      if (manifest.apiVersion !== SOURCE_PLUGIN_API_VERSION)
        return {
          directory,
          descriptor: {
            manifest,
            enabled: true,
            status: 'api_mismatch',
            health: this.previousHealth(manifest.id),
            error: `Plugin API ${manifest.apiVersion} is incompatible with core API ${SOURCE_PLUGIN_API_VERSION}`
          }
        };
      const rootPath = await realpath(resolve(directory));
      const requestedEntryPath = resolve(rootPath, manifest.entry ?? 'index.js');
      const entryPath = await realpath(requestedEntryPath);
      const relativePath = relative(rootPath, entryPath);
      if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath))
        throw new Error('Plugin entry must be inside its plugin directory');
      const info = await stat(entryPath);
      if (!info.isFile()) throw new Error('Plugin entry must be a file');
      const source = await readFile(entryPath, 'utf8');
      if (forbiddenSource.some((pattern) => pattern.test(source)))
        throw new Error('Plugin uses a forbidden runtime capability');
      const sourceVersion = createHash('sha256').update(source).digest('hex');
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${sourceVersion}`;
      const imported = (await import(moduleUrl)) as {
        default?: SourcePluginFactory;
        createPlugin?: SourcePluginFactory;
      };
      const factory = imported.default ?? imported.createPlugin;
      if (typeof factory !== 'function')
        throw new Error('Plugin must export a default factory function');
      const context: SourcePluginContext = {
        http: { get: (url, options) => this.http.get(url, options) },
        html: { load: (html) => wrapDocument(this.parser.load(html)) },
        logger: {
          info: (message, metadata) =>
            this.logger.info(
              `[plugin:${manifest.id}] ${message}${metadata ? ` ${JSON.stringify(metadata)}` : ''}`
            ),
          warn: (message, metadata) =>
            this.logger.warn(
              `[plugin:${manifest.id}] ${message}${metadata ? ` ${JSON.stringify(metadata)}` : ''}`
            )
        },
        clock: { now: () => this.clock.now().toISOString() }
      };
      const implementation = await factory(Object.freeze(context));
      if (
        !implementation ||
        typeof implementation.analyze !== 'function' ||
        typeof implementation.fetchChapter !== 'function'
      )
        throw new Error('Plugin implementation must provide analyze and fetchChapter');
      const descriptor: SourcePluginDescriptor = {
        manifest,
        enabled: true,
        status: 'active',
        health: this.previousHealth(manifest.id),
        loadedAt: this.clock.now().toISOString()
      };
      const handle = this.createHandle(descriptor, implementation);
      return { directory, descriptor, implementation, handle };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        directory,
        descriptor: {
          manifest,
          enabled: this.enabled.get(manifest.id) ?? true,
          status: 'invalid',
          health: this.previousHealth(manifest.id),
          error: message
        }
      };
    }
  }
  private createHandle(
    descriptor: SourcePluginDescriptor,
    implementation: SourcePluginImplementation
  ): SourcePluginHandle {
    const execute = async <T>(operation: () => Promise<T>) => {
      const started = Date.now();
      try {
        const result = await operation();
        const health = descriptor.health;
        health.successCount += 1;
        health.averageLatencyMs =
          (health.averageLatencyMs * (health.successCount - 1) + (Date.now() - started)) /
          health.successCount;
        health.lastSuccessAt = this.clock.now().toISOString();
        descriptor.status = 'active';
        return result;
      } catch (error) {
        descriptor.health.failureCount += 1;
        descriptor.health.lastFailureAt = this.clock.now().toISOString();
        descriptor.health.lastError = error instanceof Error ? error.message : String(error);
        if (
          descriptor.health.failureCount >= 5 &&
          descriptor.health.failureCount > descriptor.health.successCount * 2
        )
          descriptor.status = 'failed';
        throw error;
      }
    };
    return {
      id: descriptor.manifest.id,
      canHandle: async (url) => {
        if (!hostMatches(url, descriptor.manifest.match)) return false;
        if (descriptor.status === 'failed') {
          const failedAt = descriptor.health.lastFailureAt
            ? Date.parse(descriptor.health.lastFailureAt)
            : Number.NaN;
          if (
            !Number.isFinite(failedAt) ||
            this.clock.now().getTime() - failedAt < FAILURE_COOLDOWN_MS
          )
            return false;
        }
        return implementation.canHandle ? implementation.canHandle(url) : true;
      },
      analyze: (url) => execute(() => implementation.analyze(url)),
      fetchChapter: (url, signal) => execute(() => implementation.fetchChapter(url, signal))
    };
  }
  private previousHealth(id: string) {
    return this.loaded.get(id)?.descriptor.health ?? emptyHealth();
  }
  private async loadState() {
    this.stateLoaded = true;
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8')) as Record<string, boolean>;
      this.enabled = new Map(Object.entries(parsed));
    } catch {
      this.enabled = new Map();
    }
  }
  private async saveState() {
    await mkdir(dirname(resolve(this.stateFile)), { recursive: true });
    await writeFile(this.stateFile, JSON.stringify(Object.fromEntries(this.enabled), null, 2));
  }
}
