import type { SourcePluginStudioCapability } from './types';

const SUPPORTED_CAPABILITIES = [
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content'
] as const satisfies readonly SourcePluginStudioCapability[];

const PLUGIN_ID = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export interface SourcePluginStudioManifestMetadata {
  name: string;
  pluginId: string;
  version: string;
  hosts: string[];
  capabilities: SourcePluginStudioCapability[];
}

export interface SourcePluginStudioManifestState {
  valid: boolean;
  metadata?: SourcePluginStudioManifestMetadata;
  error?: string;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return items.length === value.length ? items : undefined;
}

function invalid(error: string): SourcePluginStudioManifestState {
  return { valid: false, error };
}

export function parseSourcePluginStudioManifest(source: string): SourcePluginStudioManifestState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return invalid('manifest.json must contain valid JSON.');
  }

  const manifest = object(parsed);
  if (!manifest) return invalid('manifest.json must contain a JSON object.');
  if (typeof manifest.id !== 'string' || !PLUGIN_ID.test(manifest.id)) {
    return invalid('Plugin id must use lowercase letters, numbers, and hyphens.');
  }
  if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
    return invalid('Plugin name is required.');
  }
  if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) {
    return invalid('Plugin version must be valid semantic version text.');
  }

  const engines = object(manifest.engines);
  if (!engines || typeof engines.sourceReader !== 'string' || !engines.sourceReader) {
    return invalid('engines.sourceReader is required.');
  }

  const capabilities = strings(manifest.capabilities);
  if (!capabilities) return invalid('At least one capability is required.');
  if (
    capabilities.some(
      (capability) => !SUPPORTED_CAPABILITIES.includes(capability as SourcePluginStudioCapability)
    )
  ) {
    return invalid('Plugin Studio only supports core reader capabilities.');
  }

  const contracts = object(manifest.contracts);
  if (!contracts) return invalid('Capability contracts are required.');
  for (const capability of capabilities) {
    if (!Number.isInteger(contracts[capability]) || Number(contracts[capability]) <= 0) {
      return invalid(`Missing contract version for ${capability}.`);
    }
  }

  if (!Array.isArray(manifest.matchers) || manifest.matchers.length === 0) {
    return invalid('At least one matcher is required.');
  }
  const firstMatcher = object(manifest.matchers[0]);
  const hosts = strings(firstMatcher?.hosts);
  if (!firstMatcher || !hosts || !Number.isInteger(firstMatcher.priority)) {
    return invalid('The first matcher must define hosts and an integer priority.');
  }

  const runtime = object(manifest.runtime);
  if (
    !runtime ||
    (runtime.preferredMode !== 'isolated' && runtime.preferredMode !== 'in-process')
  ) {
    return invalid('runtime.preferredMode must be isolated or in-process.');
  }

  const permissions = object(manifest.permissions);
  const network = object(permissions?.network);
  const permissionHosts = strings(network?.hosts);
  if (!permissions || !network || !permissionHosts) {
    return invalid('permissions.network.hosts must contain at least one host.');
  }

  return {
    valid: true,
    metadata: {
      name: manifest.name.trim(),
      pluginId: manifest.id,
      version: manifest.version,
      hosts,
      capabilities: capabilities as SourcePluginStudioCapability[]
    }
  };
}

export function updateSourcePluginStudioManifest(
  source: string,
  patch: Partial<SourcePluginStudioManifestMetadata>
): string {
  const state = parseSourcePluginStudioManifest(source);
  if (!state.valid) throw new Error(state.error);
  const manifest = JSON.parse(source) as JsonObject;
  const metadata = { ...state.metadata!, ...patch };
  const capabilities = [...new Set(metadata.capabilities)];
  const hosts = [...new Set(metadata.hosts.map((host) => host.trim()).filter(Boolean))];
  if (capabilities.length === 0) throw new Error('At least one capability is required.');
  if (hosts.length === 0) throw new Error('At least one host is required.');

  manifest.id = metadata.pluginId;
  manifest.name = metadata.name;
  manifest.version = metadata.version;
  manifest.capabilities = capabilities;
  manifest.contracts = Object.fromEntries(capabilities.map((capability) => [capability, 1]));

  const matchers = manifest.matchers as JsonObject[];
  manifest.matchers = [{ ...matchers[0], hosts }, ...matchers.slice(1)];
  const permissions = object(manifest.permissions)!;
  manifest.permissions = {
    ...permissions,
    network: { ...object(permissions.network), hosts }
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export const sourcePluginStudioCapabilities = SUPPORTED_CAPABILITIES;
