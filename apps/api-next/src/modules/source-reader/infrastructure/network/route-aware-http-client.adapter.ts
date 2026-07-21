import axios, { type AxiosRequestConfig } from 'axios';
import type {
  HttpClientPort,
  HttpRequestOptions,
  HttpResponse
} from '../../application/ports/runtime-support.ports.js';
import type {
  RouteAwareHttpClientPort,
  RoutedHttpRequestOptions
} from '../../application/ports/network-route.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import { ProxyAgentFactory } from './proxy-agent.factory.js';

const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

interface RouteAwareHttpClientLimits {
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}

function buildAxiosRequestConfig(
  options: HttpRequestOptions | undefined,
  limits: Required<RouteAwareHttpClientLimits>
): AxiosRequestConfig {
  return {
    timeout: options?.timeoutMs ?? limits.requestTimeoutMs,
    signal: options?.signal,
    maxRedirects: 0,
    maxContentLength: limits.maxResponseBytes,
    maxBodyLength: limits.maxResponseBytes,
    validateStatus: (status) => status >= 200 && status < 300,
    headers: {
      'User-Agent': DEFAULT_BROWSER_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...options?.headers
    },
    responseType: 'text',
    transformResponse: [(data) => data]
  };
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {};
  return Object.fromEntries(
    Object.entries(headers as Record<string, unknown>).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(', ') : String(value)
    ])
  );
}

function toResponse(
  url: string,
  response: {
    status: number;
    headers: unknown;
    data: unknown;
    request?: { res?: { responseUrl?: string } };
  }
): HttpResponse<string> {
  return {
    url: response.request?.res?.responseUrl ?? url,
    status: response.status,
    headers: normalizeHeaders(response.headers),
    data: typeof response.data === 'string' ? response.data : String(response.data ?? '')
  };
}

export class RouteAwareHttpClientAdapter implements HttpClientPort, RouteAwareHttpClientPort {
  private readonly limits: Required<RouteAwareHttpClientLimits>;

  constructor(
    private readonly agents = new ProxyAgentFactory(),
    limits: RouteAwareHttpClientLimits = {}
  ) {
    this.limits = {
      requestTimeoutMs: Math.max(1, limits.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS),
      maxResponseBytes: Math.max(1, limits.maxResponseBytes ?? MAX_RESPONSE_BYTES)
    };
  }

  get(url: string, options?: HttpRequestOptions) {
    return this.getRouted(url, { ...options, route: { kind: 'direct', identity: 'direct' } });
  }

  post(url: string, options?: HttpRequestOptions) {
    return this.postRouted(url, { ...options, route: { kind: 'direct', identity: 'direct' } });
  }

  head(url: string, options?: HttpRequestOptions) {
    return this.headRouted(url, { ...options, route: { kind: 'direct', identity: 'direct' } });
  }

  async getRouted(url: string, options: RoutedHttpRequestOptions) {
    return this.execute('GET', url, options);
  }

  async postRouted(url: string, options: RoutedHttpRequestOptions) {
    return this.execute('POST', url, options);
  }

  async headRouted(url: string, options: RoutedHttpRequestOptions) {
    return this.execute('HEAD', url, options);
  }

  destroy(): void {
    this.agents.destroy();
  }

  private async execute(
    method: 'GET' | 'POST' | 'HEAD',
    url: string,
    options: RoutedHttpRequestOptions
  ) {
    const config: AxiosRequestConfig = buildAxiosRequestConfig(options, this.limits);
    if (options.route.kind !== 'direct') {
      const agent = this.agents.get(options.route);
      config.httpAgent = agent;
      config.httpsAgent = agent;
      config.proxy = false;
    }
    try {
      const response = await axios.request({
        ...config,
        method,
        url,
        ...(method === 'POST' ? { data: options.body } : {})
      });
      return toResponse(url, response);
    } catch (error) {
      if (options.route.kind === 'direct') throw error;
      throw new SourceReaderError('NETWORK_ROUTE_UNAVAILABLE', 'Network route request failed', {
        retryable: true,
        fallbackAllowed: false,
        cause: error,
        details: { routeIdentity: options.route.identity }
      });
    }
  }
}
