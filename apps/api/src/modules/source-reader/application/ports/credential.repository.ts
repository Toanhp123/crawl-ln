export interface CredentialHandle {
  id: string;
  ownerType: 'system' | 'user';
  ownerId?: string;
  pluginId?: string;
  domain?: string;
  strategy: 'cookie-import' | 'bearer-token' | 'basic-auth' | 'form-login' | 'custom';
}

export interface CredentialRepository {
  save(
    input: CredentialHandle & {
      name: string;
      secret: Record<string, unknown>;
      enabled: boolean;
      createdAt: string;
      updatedAt: string;
    }
  ): Promise<void>;
  findHandleById(id: string): Promise<CredentialHandle | undefined>;
  findCandidates(input: {
    userId?: string;
    pluginId: string;
    domain: string;
  }): Promise<CredentialHandle[]>;
  resolveSecret(handle: CredentialHandle): Promise<Record<string, unknown>>;
  delete(id: string): Promise<void>;
}
