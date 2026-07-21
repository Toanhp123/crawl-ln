export interface AuthChallengeHandle {
  id: string;
  pluginId: string;
  credentialProfileId?: string;
  networkProfileId?: string;
  ownerId?: string;
  type: 'otp' | 'captcha' | 'approval' | 'browser-interaction';
  status: 'pending' | 'completed' | 'expired' | 'cancelled' | 'failed';
  expiresAt: string;
}

export interface AuthChallengeRepository {
  save(
    input: AuthChallengeHandle & {
      encryptedState?: Record<string, unknown>;
      credentialProfileId?: string;
      networkProfileId?: string;
      ownerId?: string;
      createdAt: string;
    }
  ): Promise<void>;
  findPendingById(id: string): Promise<AuthChallengeHandle | undefined>;
  findById(id: string): Promise<AuthChallengeHandle | undefined>;
  listPending(ownerId?: string): Promise<AuthChallengeHandle[]>;
  resolveState(handle: AuthChallengeHandle): Promise<Record<string, unknown> | undefined>;
  complete(id: string, completedAt: string): Promise<void>;
  listExpiredPending(now: string): Promise<AuthChallengeHandle[]>;
  markExpired(id: string): Promise<void>;
  cancel(id: string, completedAt: string): Promise<void>;
  expireBefore(now: string): Promise<number>;
}
