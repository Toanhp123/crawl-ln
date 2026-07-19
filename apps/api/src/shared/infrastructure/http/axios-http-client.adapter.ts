import axios, { type AxiosRequestConfig } from 'axios';
import { env } from '../../config/env.js';
import type {
  HttpClientPort,
  HttpRequestOptions,
  HttpResponse
} from '../../ports/http-client.port.js';

export const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {};
  return Object.fromEntries(
    Object.entries(headers as Record<string, unknown>).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(', ') : String(value)
    ])
  );
}

export function buildAxiosRequestConfig(options?: HttpRequestOptions): AxiosRequestConfig {
  return {
    timeout: options?.timeoutMs ?? env.requestTimeoutMs,
    signal: options?.signal,
    // Redirects are intentionally not followed here. Policy checks (allowlist, robots and
    // rate limiting) apply to the requested URL; following a redirect inside Axios would
    // send an unchecked request before the crawler can validate the destination.
    maxRedirects: 0,
    maxContentLength: env.maxHttpResponseBytes,
    maxBodyLength: env.maxHttpResponseBytes,
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

function toResponse(
  url: string,
  status: number,
  headers: unknown,
  data: unknown
): HttpResponse<string> {
  return {
    url,
    status,
    headers: normalizeHeaders(headers),
    data: typeof data === 'string' ? data : String(data ?? '')
  };
}

export class AxiosHttpClientAdapter implements HttpClientPort {
  async get(url: string, options?: HttpRequestOptions) {
    const response = await axios.get(url, buildAxiosRequestConfig(options));
    return toResponse(
      response.request?.res?.responseUrl ?? url,
      response.status,
      response.headers,
      response.data
    );
  }

  async post(url: string, options?: HttpRequestOptions) {
    const response = await axios.post(url, options?.body, buildAxiosRequestConfig(options));
    return toResponse(
      response.request?.res?.responseUrl ?? url,
      response.status,
      response.headers,
      response.data
    );
  }

  async head(url: string, options?: HttpRequestOptions) {
    const response = await axios.head(url, buildAxiosRequestConfig(options));
    return toResponse(
      response.request?.res?.responseUrl ?? url,
      response.status,
      response.headers,
      ''
    );
  }
}
