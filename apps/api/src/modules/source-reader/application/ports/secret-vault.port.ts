export interface SecretContext {
  recordType: 'credential' | 'network-profile' | 'session' | 'auth-challenge';
  recordId: string;
  ownerType?: 'system' | 'user';
  ownerId?: string;
  pluginId?: string;
}

export interface SealedSecret {
  ciphertext: Uint8Array;
  metadata: {
    algorithm: 'aes-256-gcm';
    keyVersion: number;
    nonce: string;
    authTag: string;
  };
}

export interface SecretVault {
  readonly available: boolean;
  seal(value: Uint8Array, context: SecretContext): Promise<SealedSecret>;
  unseal(secret: SealedSecret, context: SecretContext): Promise<Uint8Array>;
}
