import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type {
  SealedSecret,
  SecretContext,
  SecretVault
} from '../../application/ports/secret-vault.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

function aad(context: SecretContext): Buffer {
  return Buffer.from(
    JSON.stringify({
      recordType: context.recordType,
      recordId: context.recordId,
      ownerType: context.ownerType ?? null,
      ownerId: context.ownerId ?? null,
      pluginId: context.pluginId ?? null
    })
  );
}

export class LocalEncryptedVault implements SecretVault {
  readonly available: boolean;

  constructor(private readonly masterKey?: Buffer) {
    if (masterKey && masterKey.length !== 32) {
      throw new Error('SOURCE_READER_MASTER_KEY must decode to exactly 32 bytes');
    }
    this.available = Boolean(masterKey);
  }

  async seal(value: Uint8Array, context: SecretContext): Promise<SealedSecret> {
    const key = this.requireKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad(context));
    const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
    return {
      ciphertext,
      metadata: {
        algorithm: 'aes-256-gcm',
        keyVersion: 1,
        nonce: nonce.toString('base64url'),
        authTag: cipher.getAuthTag().toString('base64url')
      }
    };
  }

  async unseal(secret: SealedSecret, context: SecretContext): Promise<Uint8Array> {
    const key = this.requireKey();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(secret.metadata.nonce, 'base64url')
    );
    decipher.setAAD(aad(context));
    decipher.setAuthTag(Buffer.from(secret.metadata.authTag, 'base64url'));
    return Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]);
  }

  private requireKey(): Buffer {
    if (!this.masterKey) {
      throw new SourceReaderError('SECRET_VAULT_UNAVAILABLE', 'Secret vault is unavailable', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    return this.masterKey;
  }
}
