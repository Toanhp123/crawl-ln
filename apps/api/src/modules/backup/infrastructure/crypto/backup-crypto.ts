import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { BackupPasswordInvalidError } from '../../application/errors/backup.error.js';

const KEY_LENGTH = 32;

export interface EncryptedPayload {
  encrypted: Buffer;
  salt: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export function encryptPayload(content: Buffer, password: string): EncryptedPayload {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, KEY_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  return { encrypted, salt, iv, tag: cipher.getAuthTag() };
}

export function decryptPayload(
  content: Buffer,
  password: string,
  salt: Buffer,
  iv: Buffer,
  tag: Buffer
): Buffer {
  try {
    const key = scryptSync(password, salt, KEY_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(content), decipher.final()]);
  } catch {
    throw new BackupPasswordInvalidError();
  }
}
