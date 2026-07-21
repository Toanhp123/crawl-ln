import type { ClockPort } from '../../application/ports/runtime-support.ports.js';
import type { HtmlParserPort } from '../../application/ports/runtime-support.ports.js';
import type { HttpClientPort } from '../../application/ports/runtime-support.ports.js';
import type { RouteAwareHttpClientPort } from '../../application/ports/network-route.port.js';
import type { LoggerPort } from '../../application/ports/runtime-support.ports.js';
import {
  BoundedSourceReaderStructuredLogger,
  type SourceReaderStructuredLogger
} from '../../application/services/source-reader-structured-logger.js';
import type { BrowserSessionHandle } from '../../application/ports/browser-runtime.port.js';
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

export class PluginContextFactory implements PluginContextFactoryPort {
  private readonly logger: SourceReaderStructuredLogger;

  constructor(
    private readonly http: HttpClientPort | (HttpClientPort & RouteAwareHttpClientPort),
    private readonly parser: HtmlParserPort,
    private readonly clock: ClockPort,
    logger: LoggerPort | SourceReaderStructuredLogger,
    private readonly sessions?: Pick<SessionRepository, 'resolveMaterial'>
  ) {
    this.logger = 'host' in logger ? logger : new BoundedSourceReaderStructuredLogger(logger);
  }

  create(input: {
    requestId?: string;
    pluginId: string;
    pluginVersion?: string;
    capability?: string;
    allowedHosts: string[];
    signal: AbortSignal;
    runtimeContext: ResolvedRuntimeContext;
    browserSession?: BrowserSessionHandle;
  }): PluginContext {
    if (
      input.runtimeContext.session?.networkBinding === 'required' &&
      input.runtimeContext.session.networkProfileId !== input.runtimeContext.networkRoute?.id
    ) {
      throw new SourceReaderError(
        'SESSION_BINDING_MISMATCH',
        'Session requires the network route used during login',
        { retryable: false, fallbackAllowed: false }
      );
    }
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
          const requestOptions = {
            ...options,
            headers: { ...options?.headers, ...attachedHeaders },
            signal: input.signal
          };
          const route = input.runtimeContext.resolvedNetworkRoute ?? {
            kind: 'direct' as const,
            identity: 'direct' as const
          };
          return 'getRouted' in this.http
            ? this.http.getRouted(url, { ...requestOptions, route })
            : this.http.get(url, requestOptions);
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
                html: (selector) => document.nodeHtml(node, selector)
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
      ...(input.browserSession
        ? {
            browser: {
              open: (url: string) => input.browserSession!.open(url),
              waitFor: (selector: string) => input.browserSession!.waitFor(selector),
              text: (selector: string) => input.browserSession!.text(selector),
              html: (selector: string) => input.browserSession!.html(selector),
              click: (selector: string) => input.browserSession!.click(selector),
              fillSecret: (selector: string, handle: { credentialId: string; field: string }) =>
                input.browserSession!.fillSecret(selector, handle),
              cookies: () => input.browserSession!.cookies()
            }
          }
        : {}),
      logger: {
        info: (message, metadata) =>
          void this.logger.plugin(
            {
              requestId: input.requestId ?? 'untracked',
              pluginId: input.pluginId,
              pluginVersion: input.pluginVersion ?? 'unknown',
              ...(input.capability ? { capability: input.capability } : {})
            },
            { level: 'info', message, metadata }
          ),
        warn: (message, metadata) =>
          void this.logger.plugin(
            {
              requestId: input.requestId ?? 'untracked',
              pluginId: input.pluginId,
              pluginVersion: input.pluginVersion ?? 'unknown',
              ...(input.capability ? { capability: input.capability } : {})
            },
            { level: 'warn', message, metadata }
          )
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
