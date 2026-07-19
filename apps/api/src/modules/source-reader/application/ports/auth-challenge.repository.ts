export interface AuthChallengeHandle {
  id: string;
  pluginId: string;
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
  resolveState(handle: AuthChallengeHandle): Promise<Record<string, unknown> | undefined>;
  complete(id: string, completedAt: string): Promise<void>;
  expireBefore(now: string): Promise<number>;
}
