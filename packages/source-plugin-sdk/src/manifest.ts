import type { SourceCapability } from './capabilities.js';

export type PluginExecutionMode = 'in-process' | 'isolated';

export interface PluginMatcher {
  hosts: string[];
  include?: string[];
  exclude?: string[];
  capabilities?: SourceCapability[];
  priority: number;
}

export interface FormLoginManifestConfiguration {
  loginUrlTemplate: string;
  method: 'POST';
  fields: { username: string; password: string };
  staticFields: Record<string, string>;
  success: { status?: number[]; selector?: string };
  failure: { status?: number[]; selector?: string };
  session: { cookies: boolean; headers: string[] };
}

export interface PluginAuthenticationManifest {
  custom?: { fields: string[] };
  formLogin?: FormLoginManifestConfiguration;
}

export interface SourcePluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  engines: { sourceReader: string };
  capabilities: SourceCapability[];
  contracts: Partial<Record<SourceCapability, number>>;
  matchers: PluginMatcher[];
  runtime: { preferredMode: PluginExecutionMode; requiresBrowser?: boolean };
  permissions: {
    network: { hosts: string[] };
    browser?: boolean;
    authentication?: boolean;
    persistentCache?: boolean;
    externalAssets?: string[];
  };
  runtimeRequirements?: {
    authentication?: {
      required: boolean;
      methods: Array<'cookie-import' | 'bearer-token' | 'basic-auth' | 'form-login' | 'custom'>;
    };
    network?: {
      required: boolean;
      regions?: string[];
      routeTags?: string[];
      allowDirectFallback: boolean;
    };
  };
  extensionContracts?: Record<string, { version: number; schema: string; required?: boolean }>;
  authentication?: PluginAuthenticationManifest;
}

export function defineSourcePluginManifest<T extends SourcePluginManifest>(manifest: T): T {
  return manifest;
}
