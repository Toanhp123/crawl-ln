import type { HttpRequestOptions, HttpResponse } from './runtime-support.ports.js';
import type { NetworkProfileHandle } from './network-profile.repository.js';

export type ResolvedNetworkRoute =
  | { kind: 'direct'; identity: 'direct' }
  | {
      kind: 'http-proxy' | 'https-proxy' | 'socks-proxy';
      identity: string;
      endpoint: string;
      username?: string;
      password?: string;
    };

export interface NetworkRouteResolverPort {
  resolve(handle?: NetworkProfileHandle): Promise<ResolvedNetworkRoute>;
}

export interface RoutedHttpRequestOptions extends HttpRequestOptions {
  route: ResolvedNetworkRoute;
}

export interface RouteAwareHttpClientPort {
  getRouted(url: string, options: RoutedHttpRequestOptions): Promise<HttpResponse<string>>;
  postRouted(url: string, options: RoutedHttpRequestOptions): Promise<HttpResponse<string>>;
  headRouted(url: string, options: RoutedHttpRequestOptions): Promise<HttpResponse<string>>;
}
