export interface TrustedSigningKey {
  id: string;
  algorithm: 'ed25519';
  publicKeyPem: string;
}

export interface TrustStorePort {
  find(keyId: string): Promise<TrustedSigningKey | undefined>;
}
