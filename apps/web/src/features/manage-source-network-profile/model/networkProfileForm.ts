import type {
  SourceReaderNetworkProfileUpdateRequest,
  SourceReaderNetworkRouteType,
  SourceReaderOwnerType
} from '@novel-tool/shared';

export type EditableNetworkRouteType = Exclude<SourceReaderNetworkRouteType, 'vpn-gateway'>;
export type NetworkProfileFormState = {
  name: string;
  ownerType: SourceReaderOwnerType;
  routeType: EditableNetworkRouteType;
  regions: string;
  tags: string;
  proxyUrl: string;
  proxyUsername: string;
  proxyPassword: string;
};

export const createEmptyNetworkProfileForm = (): NetworkProfileFormState => ({
  name: '',
  ownerType: 'user',
  routeType: 'direct',
  regions: '',
  tags: '',
  proxyUrl: '',
  proxyUsername: '',
  proxyPassword: ''
});

export const splitNetworkValues = (input: string) =>
  input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

function replacementConfig(state: NetworkProfileFormState) {
  const url = state.proxyUrl.trim();
  if (!url) return undefined;
  return {
    endpoint: url,
    ...(state.proxyUsername.trim() ? { username: state.proxyUsername.trim() } : {}),
    ...(state.proxyPassword ? { password: state.proxyPassword } : {})
  };
}

function hasValidEndpoint(state: NetworkProfileFormState) {
  try {
    const endpoint = new URL(state.proxyUrl.trim());
    const expectedProtocol =
      state.routeType === 'http-proxy'
        ? 'http:'
        : state.routeType === 'https-proxy'
          ? 'https:'
          : 'socks5:';
    return endpoint.protocol === expectedProtocol && Boolean(endpoint.hostname && endpoint.port);
  } catch {
    return false;
  }
}

export function canSubmitNetworkProfile(
  state: NetworkProfileFormState,
  originalRouteType?: SourceReaderNetworkRouteType
) {
  if (!state.name.trim()) return false;
  if (state.routeType === 'direct') return true;
  const replacesSecret = Boolean(state.proxyUsername.trim() || state.proxyPassword);
  const changesRoute = !originalRouteType || originalRouteType !== state.routeType;
  return !changesRoute && !replacesSecret && !state.proxyUrl.trim()
    ? true
    : hasValidEndpoint(state);
}

export function buildNetworkProfileUpdate(
  state: NetworkProfileFormState,
  originalRouteType: SourceReaderNetworkRouteType
): SourceReaderNetworkProfileUpdateRequest {
  const patch: SourceReaderNetworkProfileUpdateRequest = {
    name: state.name.trim(),
    routeType: state.routeType,
    regions: splitNetworkValues(state.regions),
    tags: splitNetworkValues(state.tags)
  };
  if (state.routeType === 'direct') return { ...patch, config: {} };
  const config = replacementConfig(state);
  return config ? { ...patch, config } : patch;
}

export function buildNetworkProfileCreate(state: NetworkProfileFormState) {
  const config = state.routeType === 'direct' ? undefined : replacementConfig(state);
  return {
    ownerType: state.ownerType,
    name: state.name.trim(),
    routeType: state.routeType,
    regions: splitNetworkValues(state.regions),
    tags: splitNetworkValues(state.tags),
    ...(config ? { config } : {})
  };
}
