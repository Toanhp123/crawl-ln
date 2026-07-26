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
import type { SourceRequestGatePort } from '../../application/ports/source-request-gate.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import { ProxyAgentFactory } from './proxy-agent.factory.js';

const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

interface RouteAwareHttpClientLimits {
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  requestGate?: Pick<SourceRequestGatePort, 'enter'>;
}

type ResolvedHttpClientLimits = Required<
  Pick<RouteAwareHttpClientLimits, 'requestTimeoutMs' | 'maxResponseBytes'>
>;

function buildAxiosRequestConfig(
  options: HttpRequestOptions | undefined,
  limits: ResolvedHttpClientLimits
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

function responseStatus(error: unknown): number | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  return typeof error.response?.status === 'number' ? error.response.status : undefined;
}

function responseHeader(error: unknown, name: string): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const headers = normalizeHeaders(error.response?.headers);
  return headers[name.toLowerCase()];
}

function directSourceError(error: unknown, limits: ResolvedHttpClientLimits): unknown {
  if (error instanceof SourceReaderError || !axios.isAxiosError(error)) return error;
  const code = String(error.code ?? '');
  const message = error.message.toLowerCase();
  const status = responseStatus(error);

  if (code === 'ERR_CANCELED' || axios.isCancel(error)) {
    return new SourceReaderError('SOURCE_READER_CANCELLED', 'Source request was cancelled', {
      retryable: false,
      fallbackAllowed: false,
      cause: error
    });
  }
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || message.includes('timeout')) {
    return new SourceReaderError('SOURCE_REQUEST_TIMEOUT', 'Source request timed out', {
      retryable: true,
      fallbackAllowed: true,
      cause: error,
      details: { timeoutMs: limits.requestTimeoutMs }
    });
  }
  if (
    message.includes('maxcontentlength') ||
    message.includes('maxbodylength') ||
    (message.includes('size of') && message.includes('exceeded'))
  ) {
    return new SourceReaderError(
      'SOURCE_RESPONSE_TOO_LARGE',
      'Source response exceeded the configured size limit',
      {
        retryable: false,
        fallbackAllowed: true,
        cause: error,
        details: { maxResponseBytes: limits.maxResponseBytes }
      }
    );
  }
  if (status === 429) {
    return new SourceReaderError('SOURCE_RATE_LIMITED', 'Source rate limit was exceeded', {
      retryable: true,
      fallbackAllowed: true,
      cause: error,
      details: {
        status,
        ...(responseHeader(error, 'retry-after') === undefined
          ? {}
          : { retryAfter: responseHeader(error, 'retry-after') })
      }
    });
  }
  if (status !== undefined && [408, 425, 500, 502, 503, 504].includes(status)) {
    return new SourceReaderError(
      'SOURCE_TEMPORARILY_UNAVAILABLE',
      'Source is temporarily unavailable',
      {
        retryable: true,
        fallbackAllowed: true,
        cause: error,
        details: { status }
      }
    );
  }
  if (status === 401 || status === 403) {
    return new SourceReaderError('NETWORK_ACCESS_BLOCKED', 'Source access was blocked', {
      retryable: false,
      fallbackAllowed: true,
      cause: error,
      details: { status }
    });
  }
  if (status !== undefined) {
    return new SourceReaderError(
      'SOURCE_TEMPORARILY_UNAVAILABLE',
      `Source request failed with HTTP ${status}`,
      {
        retryable: false,
        fallbackAllowed: true,
        cause: error,
        details: { status }
      }
    );
  }
  return new SourceReaderError('SOURCE_TEMPORARILY_UNAVAILABLE', 'Source network request failed', {
    retryable: true,
    fallbackAllowed: true,
    cause: error,
    details: { networkCode: code || 'UNKNOWN' }
  });
}

export class RouteAwareHttpClientAdapter implements HttpClientPort, RouteAwareHttpClientPort {
  private readonly limits: ResolvedHttpClientLimits;
  private readonly requestGate?: Pick<SourceRequestGatePort, 'enter'>;

  constructor(
    private readonly agents = new ProxyAgentFactory(),
    limits: RouteAwareHttpClientLimits = {}
  ) {
    this.requestGate = limits.requestGate;
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
    await this.requestGate?.enter(url, options.signal);
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
      if (options.route.kind === 'direct') throw directSourceError(error, this.limits);
      throw new SourceReaderError('NETWORK_ROUTE_UNAVAILABLE', 'Network route request failed', {
        retryable: true,
        fallbackAllowed: false,
        cause: error,
        details: { routeIdentity: options.route.identity }
      });
    }
  }
}
