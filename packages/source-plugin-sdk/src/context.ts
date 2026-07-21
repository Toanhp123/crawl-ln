export interface PluginHttpRequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface PluginHttpResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  data: string;
}

export interface ExternalPluginHtmlNode {
  text(selector?: string): Promise<string>;
  attr(name: string): Promise<string | undefined>;
  html(selector?: string): Promise<string>;
}

export interface ExternalPluginHtmlDocument {
  text(selector: string): Promise<string>;
  attr(selector: string, name: string): Promise<string | undefined>;
  html(selector: string): Promise<string>;
  all(selector: string): Promise<ExternalPluginHtmlNode[]>;
  remove(selector: string): Promise<void>;
}

export interface ExternalPluginSignal {
  readonly aborted: boolean;
}

export interface ExternalPluginContext {
  http: {
    get(url: string, options?: PluginHttpRequestOptions): Promise<PluginHttpResponse>;
  };
  html: {
    load(source: string): ExternalPluginHtmlDocument;
  };
  url: {
    normalize(value: string): Promise<string>;
    resolve(value: string, base: string): Promise<string>;
  };
  cache: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  };
  browser?: {
    open(url: string): Promise<void>;
    waitFor(selector: string): Promise<void>;
    text(selector: string): Promise<string | null>;
    html(selector: string): Promise<string | null>;
    click(selector: string): Promise<void>;
    fillSecret(selector: string, handle: { credentialId: string; field: string }): Promise<void>;
    cookies(): Promise<Array<Record<string, unknown>>>;
  };
  logger: {
    info(message: string, metadata?: Record<string, unknown>): Promise<void>;
    warn(message: string, metadata?: Record<string, unknown>): Promise<void>;
  };
  clock: {
    now(): string;
  };
  host: {
    clockNow(): Promise<string>;
  };
  signal: ExternalPluginSignal;
  normalizedUrl: string;
}
