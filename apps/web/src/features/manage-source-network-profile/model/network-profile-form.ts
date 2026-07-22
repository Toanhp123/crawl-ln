import type { SourceNetworkProfile } from '../../../entities/source-network-profile';
export type NetworkRouteType = 'direct' | 'http-proxy' | 'https-proxy' | 'socks-proxy';
export type NetworkOwnerType = 'system' | 'user';
export interface NetworkProfileFormState {
  ownerType: NetworkOwnerType;
  name: string;
  routeType: NetworkRouteType;
  regions: string;
  tags: string;
  proxyUrl: string;
  proxyUsername: string;
  proxyPassword: string;
  enabled: boolean;
}
export interface NetworkProfileCreateInput {
  ownerType: NetworkOwnerType;
  name: string;
  routeType: NetworkRouteType;
  regions: string[];
  tags: string[];
  config?: Record<string, unknown>;
}
export type NetworkProfileUpdateInput = Partial<Omit<NetworkProfileCreateInput, 'ownerType'>> & {
  enabled?: boolean;
};
const split = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
export function createEmptyNetworkProfileForm(): NetworkProfileFormState {
  return {
    ownerType: 'user',
    name: '',
    routeType: 'direct',
    regions: '',
    tags: '',
    proxyUrl: '',
    proxyUsername: '',
    proxyPassword: '',
    enabled: true
  };
}
export function clearNetworkProfileSecret(form: NetworkProfileFormState): NetworkProfileFormState {
  return { ...form, proxyPassword: '' };
}
export function networkProfileFormFromProfile(
  profile: SourceNetworkProfile
): NetworkProfileFormState {
  return {
    ownerType: profile.ownerType,
    name: profile.name,
    routeType: profile.routeType === 'vpn-gateway' ? 'direct' : profile.routeType,
    regions: profile.regions.join(', '),
    tags: profile.tags.join(', '),
    proxyUrl: '',
    proxyUsername: '',
    proxyPassword: '',
    enabled: profile.enabled
  };
}
function replacementConfig(form: NetworkProfileFormState): Record<string, unknown> | undefined {
  const endpoint = form.proxyUrl.trim();
  if (!endpoint) return undefined;
  return {
    endpoint,
    ...(form.proxyUsername.trim() ? { username: form.proxyUsername.trim() } : {}),
    ...(form.proxyPassword ? { password: form.proxyPassword } : {})
  };
}
function hasValidEndpoint(form: NetworkProfileFormState) {
  try {
    const endpoint = new URL(form.proxyUrl.trim());
    const expected =
      form.routeType === 'http-proxy'
        ? 'http:'
        : form.routeType === 'https-proxy'
          ? 'https:'
          : 'socks5:';
    return endpoint.protocol === expected && Boolean(endpoint.hostname && endpoint.port);
  } catch {
    return false;
  }
}
export function canSubmitNetworkProfile(
  form: NetworkProfileFormState,
  originalRouteType?: SourceNetworkProfile['routeType']
) {
  if (!form.name.trim()) return false;
  if (form.routeType === 'direct') return true;
  const replacesSecret = Boolean(form.proxyUsername.trim() || form.proxyPassword);
  const changesRoute = !originalRouteType || originalRouteType !== form.routeType;
  return !changesRoute && !replacesSecret && !form.proxyUrl.trim() ? true : hasValidEndpoint(form);
}
export function buildNetworkProfileCreate(
  form: NetworkProfileFormState
): NetworkProfileCreateInput {
  const config = form.routeType === 'direct' ? undefined : replacementConfig(form);
  return {
    ownerType: form.ownerType,
    name: form.name.trim(),
    routeType: form.routeType,
    regions: split(form.regions),
    tags: split(form.tags),
    ...(config ? { config } : {})
  };
}
export function buildNetworkProfileUpdate(
  form: NetworkProfileFormState,
  originalRouteType?: SourceNetworkProfile['routeType']
): NetworkProfileUpdateInput {
  const patch: NetworkProfileUpdateInput = {
    name: form.name.trim(),
    routeType: form.routeType,
    regions: split(form.regions),
    tags: split(form.tags),
    enabled: form.enabled
  };
  if (form.routeType === 'direct') return { ...patch, config: {} };
  const config = replacementConfig(form);
  if (config) return { ...patch, config };
  return originalRouteType === form.routeType ? patch : { ...patch, config: {} };
}
