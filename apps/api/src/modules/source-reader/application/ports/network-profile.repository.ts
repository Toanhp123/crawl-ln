export type NetworkRouteType = 'direct' | 'http-proxy' | 'https-proxy' | 'socks-proxy';
export interface NetworkProfileHandle {
  id: string;
  ownerType: 'system' | 'user';
  ownerId?: string;
  routeType: NetworkRouteType;
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
  listMetadata(input: { ownerId?: string; includeSystem: boolean }): Promise<
    Array<
      NetworkProfileHandle & {
        name: string;
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
      }
    >
  >;
  requireHandle(id: string): Promise<NetworkProfileHandle>;
  requireStoredHandle(id: string): Promise<NetworkProfileHandle>;
  update(
    id: string,
    patch: Partial<{
      name: string;
      routeType: NetworkRouteType;
      regions: string[];
      tags: string[];
      config: Record<string, unknown>;
      enabled: boolean;
    }>,
    updatedAt: string
  ): Promise<void>;
  setHealth(
    id: string,
    status: NetworkProfileHandle['healthStatus'],
    checkedAt: string
  ): Promise<void>;
  delete(id: string): Promise<void>;
}
