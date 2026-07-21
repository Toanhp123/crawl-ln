export interface ClockPort {
  now(): Date;
}

export interface LoggerPort {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface HttpResponse<T = string> {
  url: string;
  status: number;
  headers: Record<string, string>;
  data: T;
}

export interface HttpClientPort {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse<string>>;
  post(url: string, options?: HttpRequestOptions): Promise<HttpResponse<string>>;
  head(url: string, options?: HttpRequestOptions): Promise<HttpResponse<string>>;
}

export type HtmlNode = unknown;

export interface HtmlDocumentPort {
  text(selector: string): string;
  attr(selector: string, name: string): string | undefined;
  html(selector: string): string;
  queryAll(selector: string): HtmlNode[];
  nodeText(node: HtmlNode, selector?: string): string;
  nodeAttr(node: HtmlNode, name: string): string | undefined;
  nodeHtml(node: HtmlNode, selector?: string): string;
  remove(selector: string): void;
}

export interface HtmlParserPort {
  load(html: string): HtmlDocumentPort;
}
