import type {
  TrustedSigningKey,
  TrustStorePort
} from '../../../application/ports/trust-store.port.js';

export class StaticTrustStore implements TrustStorePort {
  private readonly byId: Map<string, TrustedSigningKey>;

  constructor(keys: TrustedSigningKey[]) {
    this.byId = new Map(keys.map((key) => [key.id, key]));
  }

  async find(keyId: string): Promise<TrustedSigningKey | undefined> {
    return this.byId.get(keyId);
  }
}
