import { createHash } from 'node:crypto';
import type {
  NetworkRouteResolverPort,
  ResolvedNetworkRoute
} from '../../application/ports/network-route.port.js';
import type {
  NetworkProfileRepository,
  NetworkProfileHandle
} from '../../application/ports/network-profile.repository.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

function unsupported(message: string): never {
  throw new SourceReaderError('NETWORK_ROUTE_UNSUPPORTED', message, {
    retryable: false,
    fallbackAllowed: false
  });
}

function routeIdentity(handle: NetworkProfileHandle, config: Record<string, unknown>): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        profileId: handle.id,
        routeType: handle.routeType,
        endpoint: config.endpoint,
        username: config.username,
        password: config.password
      })
    )
    .digest('hex');
}

export class NetworkRouteResolver implements NetworkRouteResolverPort {
  constructor(private readonly profiles: Pick<NetworkProfileRepository, 'resolveConfig'>) {}

  async resolve(handle?: NetworkProfileHandle): Promise<ResolvedNetworkRoute> {
    if (!handle || handle.routeType === 'direct') return { kind: 'direct', identity: 'direct' };
    const config = await this.profiles.resolveConfig(handle);
    if (!config) {
      throw new SourceReaderError(
        'NETWORK_ROUTE_UNAVAILABLE',
        'Network route configuration is unavailable',
        {
          retryable: true,
          fallbackAllowed: false,
          details: { profileId: handle.id }
        }
      );
    }
    if (typeof config.endpoint !== 'string') {
      return unsupported('Network route endpoint is required');
    }
    let parsed: URL;
    try {
      parsed = new URL(config.endpoint);
    } catch {
      return unsupported('Network route endpoint is invalid');
    }
    const scheme = parsed.protocol;
    const expected =
      handle.routeType === 'http-proxy'
        ? 'http:'
        : handle.routeType === 'https-proxy'
          ? 'https:'
          : 'socks5:';
    if (scheme !== expected || !parsed.hostname || !parsed.port) {
      return unsupported(`Network route requires ${expected}//host:port`);
    }
    const username =
      typeof config.username === 'string' ? config.username : decodeURIComponent(parsed.username);
    const password =
      typeof config.password === 'string' ? config.password : decodeURIComponent(parsed.password);
    parsed.username = '';
    parsed.password = '';
    return {
      kind: handle.routeType,
      identity: routeIdentity(handle, config),
      endpoint: parsed.toString().replace(/\/$/, ''),
      ...(username ? { username } : {}),
      ...(password ? { password } : {})
    };
  }
}
