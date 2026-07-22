export type HttpMethod = 'GET' | 'POST' | 'HEAD';

export type HttpRequestOptions = {
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type HttpResponse<T = string> = {
  url: string;
  status: number;
  headers: Record<string, string>;
  data: T;
};

export interface HttpClientPort {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse<string>>;
  post(url: string, options?: HttpRequestOptions): Promise<HttpResponse<string>>;
  head(url: string, options?: HttpRequestOptions): Promise<HttpResponse<string>>;
}
