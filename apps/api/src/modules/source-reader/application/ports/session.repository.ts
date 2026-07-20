import type { SourceReaderInvalidationEvent } from './source-reader-invalidation.port.js';
export interface SessionHandle {
  id: string;
  pluginId: string;
  pluginVersion: string;
  credentialProfileId: string;
  ownerId?: string;
  networkProfileId?: string;
  networkBinding: 'none' | 'preferred' | 'required';
  expiresAt?: string;
}

export interface SessionRepository {
  save(
    input: SessionHandle & {
      encryptedMaterial: Record<string, unknown>;
      status: 'active' | 'expired' | 'revoked';
      createdAt: string;
    }
  ): Promise<void>;
  findActive(input: {
    pluginId: string;
    pluginVersion: string;
    credentialProfileId: string;
    ownerId?: string;
    networkProfileId?: string;
  }): Promise<SessionHandle | undefined>;
  resolveMaterial(handle: SessionHandle): Promise<Record<string, unknown>>;
  revokeByCredential(credentialProfileId: string): Promise<void>;
  revokeByNetworkProfile(networkProfileId: string): Promise<void>;
  revokeMatching(event: SourceReaderInvalidationEvent): Promise<number>;
  expireBefore(now: string): Promise<number>;
}
