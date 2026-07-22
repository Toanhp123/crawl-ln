import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { NetworkProfileRepository } from '../../application/ports/network-profile.repository.js';
import type {
  NetworkRouteResolverPort,
  RouteAwareHttpClientPort
} from '../../application/ports/network-route.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

export class NetworkRouteTester {
  constructor(
    private readonly profiles: Pick<NetworkProfileRepository, 'requireHandle' | 'setHealth'>,
    private readonly routes: NetworkRouteResolverPort,
    private readonly http: RouteAwareHttpClientPort,
    private readonly clock: ClockPort,
    private readonly diagnosticUrl: string,
    private readonly timeoutMs: number
  ) {}

  async test(profileId: string, ownerId?: string) {
    const profile = await this.profiles.requireHandle(profileId);
    if (profile.ownerType === 'user' && profile.ownerId !== ownerId) {
      throw new SourceReaderError(
        'PLUGIN_PERMISSION_DENIED',
        'Network profile belongs to another user',
        {
          retryable: false,
          fallbackAllowed: false
        }
      );
    }
    const startedAt = this.clock.now().getTime();
    try {
      const route = await this.routes.resolve(profile);
      await this.http.getRouted(this.diagnosticUrl, { route, timeoutMs: this.timeoutMs });
      const checkedAt = this.clock.now().toISOString();
      await this.profiles.setHealth(profileId, 'healthy', checkedAt);
      return {
        status: 'healthy' as const,
        ...(profile.regions[0] ? { region: profile.regions[0] } : {}),
        latencyMs: Math.max(0, this.clock.now().getTime() - startedAt),
        checkedAt
      };
    } catch (error) {
      const checkedAt = this.clock.now().toISOString();
      await this.profiles.setHealth(profileId, 'offline', checkedAt);
      throw new SourceReaderError('NETWORK_ROUTE_TEST_FAILED', 'Network route test failed', {
        retryable: true,
        fallbackAllowed: false,
        cause: error,
        details: { profileId, checkedAt }
      });
    }
  }
}
