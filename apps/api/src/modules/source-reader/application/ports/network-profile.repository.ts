export interface NetworkProfileHandle {
  id: string;
  ownerType: 'system' | 'user';
  ownerId?: string;
  routeType: 'direct' | 'http-proxy' | 'socks-proxy' | 'vpn-gateway';
  regions: string[];
  tags: string[];
  healthStatus: 'unknown' | 'healthy' | 'degraded' | 'offline';
}

export interface NetworkProfileRepository {
  save(
    input: NetworkProfileHandle & {
      name: string;
      secretConfig?: Record<string, unknown>;
      enabled?: boolean;
      createdAt?: string;
      updatedAt?: string;
    }
  ): Promise<void>;
  findHandleById(id: string): Promise<NetworkProfileHandle | undefined>;
  findCandidates(input: {
    userId?: string;
    regions?: string[];
    tags?: string[];
  }): Promise<NetworkProfileHandle[]>;
  resolveConfig(handle: NetworkProfileHandle): Promise<Record<string, unknown> | undefined>;
}
