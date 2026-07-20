import type { ResolvedNetworkRoute } from './network-route.port.js';

export interface BrowserSessionIdentity {
  userId?: string;
  pluginId: string;
  pluginVersion?: string;
  sourceAccountId: string;
  credentialId?: string;
  sessionId?: string;
  networkRouteId?: string;
  networkIdentity?: string;
}

export interface BrowserSecretHandle {
  credentialId: string;
  field: string;
}

export interface BrowserSessionHandle {
  readonly id: string;
  open(url: string): Promise<void>;
  waitFor(selector: string): Promise<void>;
  text(selector: string): Promise<string | null>;
  html(selector: string): Promise<string | null>;
  click(selector: string): Promise<void>;
  fillSecret(selector: string, secretHandle: BrowserSecretHandle): Promise<void>;
  cookies(): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

export interface BrowserRuntimePort {
  open(input: {
    identity: BrowserSessionIdentity;
    allowedHosts: string[];
    route: ResolvedNetworkRoute;
    signal: AbortSignal;
  }): Promise<BrowserSessionHandle>;
  closeByIdentity(identity: BrowserSessionIdentity): Promise<void>;
}
