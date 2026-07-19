import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { HtmlParserPort } from '../../../../shared/ports/html-parser.port.js';
import type { HttpClientPort } from '../../../../shared/ports/http-client.port.js';
import type { LoggerPort } from '../../../../shared/ports/logger.port.js';
import type { PluginContextFactoryPort } from '../../application/ports/plugin-context-factory.port.js';
import type { SessionRepository } from '../../application/ports/session.repository.js';
import type { ResolvedRuntimeContext } from '../../application/ports/runtime-context-resolver.port.js';
import { normalizeSourceUrl } from '../../application/services/plugin-matcher.js';
import type { AuthSessionMaterial } from '../../domain/auth/authentication.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { PluginContext, PluginHtmlDocument } from '../../domain/plugin/source-plugin.js';

function allowed(host: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const normalized = pattern.toLowerCase().replace(/^\*\./, '');
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

function formatLog(message: string, metadata?: Record<string, unknown>): string {
  return metadata ? `${message} ${JSON.stringify(metadata)}` : message;
}

export class PluginContextFactory implements PluginContextFactoryPort {
  constructor(
    private readonly http: HttpClientPort,
    private readonly parser: HtmlParserPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    private readonly sessions?: Pick<SessionRepository, 'resolveMaterial'>
  ) {}

  create(input: {
    pluginId: string;
    allowedHosts: string[];
    signal: AbortSignal;
    runtimeContext: ResolvedRuntimeContext;
  }): PluginContext {
    const memory = new Map<string, { expiresAt: number; value: unknown }>();
    let sessionHeaders: Promise<Record<string, string>> | undefined;
    const resolveSessionHeaders = () => {
      if (!sessionHeaders) {
        sessionHeaders = this.resolveSessionHeaders(input.runtimeContext);
      }
      return sessionHeaders;
    };

    return {
      http: {
        get: async (url, options) => {
          const host = new URL(url).hostname.toLowerCase();
          if (!allowed(host, input.allowedHosts)) {
            throw new SourceReaderError(
              'PLUGIN_NETWORK_PERMISSION_DENIED',
              `Plugin ${input.pluginId} cannot access ${host}`,
              { retryable: false, fallbackAllowed: false, details: { host } }
            );
          }
          if (input.signal.aborted) {
            throw new SourceReaderError('SOURCE_READER_CANCELLED', 'Request cancelled', {
              retryable: false,
              fallbackAllowed: false
            });
          }
          const attachedHeaders = await resolveSessionHeaders();
          return this.http.get(url, {
            ...options,
            headers: { ...options?.headers, ...attachedHeaders },
            signal: input.signal
          });
        }
      },
      html: {
        load: (source): PluginHtmlDocument => {
          const document = this.parser.load(source);
          return {
            text: (selector) => document.text(selector),
            attr: (selector, name) => document.attr(selector, name),
            html: (selector) => document.html(selector),
            remove: (selector) => document.remove(selector),
            all: (selector) =>
              document.queryAll(selector).map((node) => ({
                text: (childSelector) =>
                  childSelector ? document.nodeText(node, childSelector) : document.nodeText(node),
                attr: (name) => document.nodeAttr(node, name),
                html: () => ''
              }))
          };
        }
      },
      url: {
        normalize: normalizeSourceUrl,
        resolve: (value, base) => new URL(value, base).toString()
      },
      cache: {
        get: async <T>(key: string) => {
          const item = memory.get(key);
          if (!item || item.expiresAt <= Date.now()) return undefined;
          return item.value as T;
        },
        set: async <T>(key: string, value: T, ttlMs: number) => {
          memory.set(key, { value, expiresAt: Date.now() + ttlMs });
        }
      },
      logger: {
        info: (message, metadata) =>
          this.logger.info(formatLog(`[${input.pluginId}] ${message}`, metadata)),
        warn: (message, metadata) =>
          this.logger.warn(formatLog(`[${input.pluginId}] ${message}`, metadata))
      },
      clock: { now: () => this.clock.now().toISOString() },
      signal: input.signal
    };
  }
  private async resolveSessionHeaders(
    runtimeContext: ResolvedRuntimeContext
  ): Promise<Record<string, string>> {
    if (!runtimeContext.session || !this.sessions) return {};
    const material = (await this.sessions.resolveMaterial(
      runtimeContext.session
    )) as unknown as AuthSessionMaterial;
    const headers: Record<string, string> = {};
    if (material.headers && typeof material.headers === 'object') {
      for (const [name, value] of Object.entries(material.headers)) {
        if (typeof value === 'string') headers[name] = value;
      }
    }
    if (Array.isArray(material.cookies) && material.cookies.length > 0) {
      headers.Cookie = material.cookies
        .filter(
          (cookie) => cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string'
        )
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ');
    }
    return headers;
  }
}
