import axios, { type AxiosRequestConfig } from 'axios';
import type {
  HttpClientPort,
  HttpRequestOptions,
  HttpResponse
} from '../../../../shared/ports/http-client.port.js';
import { buildAxiosRequestConfig } from '../../../../shared/infrastructure/http/axios-http-client.adapter.js';
import type {
  RouteAwareHttpClientPort,
  RoutedHttpRequestOptions
} from '../../application/ports/network-route.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import { ProxyAgentFactory } from './proxy-agent.factory.js';

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
  constructor(private readonly agents = new ProxyAgentFactory()) {}

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
    const config: AxiosRequestConfig = buildAxiosRequestConfig(options);
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
