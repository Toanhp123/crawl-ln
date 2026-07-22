import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { z } from 'zod';
import { BackupBadRequestError } from '../../application/errors/backup.error.js';
import type {
  BackupArchivePort,
  OpenedBackup
} from '../../application/ports/backup-archive.port.js';
import type { BackupSnapshot } from '../../application/ports/backup-store.port.js';
import type { BackupManifest } from '../../domain/backup.js';
import { decryptPayload, encryptPayload } from '../crypto/backup-crypto.js';
import { env } from '../../../../shared/config/env.js';
import { CURRENT_SCHEMA_VERSION } from '../../../../shared/database/sqlite.js';
const manifestSchema = z.union([
  z.object({
    format: z.literal('novel-tool-backup'),
    formatVersion: z.literal(1),
    appVersion: z.string(),
    createdAt: z.string().datetime({ offset: true }),
    encrypted: z.boolean(),
    algorithm: z.enum(['none', 'aes-256-gcm']),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    payloadSize: z.number().int().nonnegative()
  }),
  z.object({
    format: z.literal('novel-tool-backup'),
    formatVersion: z.literal(2),
    appVersion: z.string(),
    schemaVersion: z.number().int().nonnegative(),
    minimumAppVersion: z.string(),
    createdAt: z.string().datetime({ offset: true }),
    encrypted: z.boolean(),
    algorithm: z.enum(['none', 'aes-256-gcm']),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    payloadSize: z.number().int().nonnegative()
  })
]);
function versionParts(value: string) {
  return value.split('.').map((part) => Number.parseInt(part, 10) || 0);
}
function isGreater(left: string, right: string) {
  const a = versionParts(left),
    b = versionParts(right);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
export type BackupArchiveLimits = {
  maxArchiveBytes: number;
  maxDatabaseBytes: number;
  maxCoversBytes: number;
  maxCoverBytes: number;
  maxEntries: number;
};
const DEFAULT_LIMITS: BackupArchiveLimits = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxDatabaseBytes: 384 * 1024 * 1024,
  maxCoversBytes: 128 * 1024 * 1024,
  maxCoverBytes: 20 * 1024 * 1024,
  maxEntries: 2000
};
const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');

export class JsZipBackupArchive implements BackupArchivePort {
  private readonly limits: BackupArchiveLimits;
  constructor(limits: Partial<BackupArchiveLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }
  private validateSnapshot(snapshot: BackupSnapshot) {
    if (snapshot.database.length > this.limits.maxDatabaseBytes)
      throw new BackupBadRequestError('Backup database is too large');
    if (snapshot.covers.length + 2 > this.limits.maxEntries)
      throw new BackupBadRequestError('Backup payload contains too many entries');
    let totalCoverBytes = 0;
    for (const cover of snapshot.covers) {
      if (cover.content.length > this.limits.maxCoverBytes)
        throw new BackupBadRequestError('Backup cover is too large');
      totalCoverBytes += cover.content.length;
      if (totalCoverBytes > this.limits.maxCoversBytes)
        throw new BackupBadRequestError('Backup covers are too large');
    }
  }
  async create(
    snapshot: BackupSnapshot,
    password?: string
  ): Promise<{ content: Buffer; manifest: BackupManifest }> {
    this.validateSnapshot(snapshot);
    const payload = new JSZip();
    payload.file('database.sqlite', snapshot.database);
    payload.file('settings.json', JSON.stringify(snapshot.settings, null, 2));
    for (const cover of snapshot.covers) payload.file(`covers/${cover.path}`, cover.content);
    const payloadContent = await payload.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    if (payloadContent.length > this.limits.maxArchiveBytes)
      throw new BackupBadRequestError('Backup payload is too large');

    const outer = new JSZip();
    let storedPayload = payloadContent;
    const encrypted = Boolean(password);
    if (password) {
      const result = encryptPayload(payloadContent, password);
      storedPayload = result.encrypted;
      outer.file(
        'crypto.json',
        JSON.stringify({
          salt: result.salt.toString('base64'),
          iv: result.iv.toString('base64'),
          tag: result.tag.toString('base64')
        })
      );
    }

    const manifest: BackupManifest = {
      format: 'novel-tool-backup',
      formatVersion: 2,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      minimumAppVersion: '2.9.1',
      appVersion: env.appVersion,
      createdAt: new Date().toISOString(),
      encrypted,
      algorithm: encrypted ? 'aes-256-gcm' : 'none',
      checksumSha256: sha256(storedPayload),
      payloadSize: storedPayload.length
    };
    outer.file('manifest.json', JSON.stringify(manifest, null, 2));
    outer.file(encrypted ? 'payload.enc' : 'payload.zip', storedPayload);
    const content = await outer.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    if (content.length > this.limits.maxArchiveBytes)
      throw new BackupBadRequestError('Backup archive is too large');
    return { content, manifest };
  }

  async open(content: Buffer, password?: string): Promise<OpenedBackup> {
    if (content.length > this.limits.maxArchiveBytes)
      throw new BackupBadRequestError('Backup archive is too large');
    let outer: JSZip;
    try {
      outer = await JSZip.loadAsync(content);
    } catch {
      throw new BackupBadRequestError('Invalid backup archive');
    }
    const manifestFile = outer.file('manifest.json');
    if (!manifestFile) throw new BackupBadRequestError('Backup manifest is missing');
    let manifest: BackupManifest;
    try {
      manifest = manifestSchema.parse(
        JSON.parse(await manifestFile.async('string'))
      ) as BackupManifest;
    } catch {
      throw new BackupBadRequestError('Invalid backup manifest');
    }
    if (manifest.formatVersion === 2) {
      if ((manifest.schemaVersion ?? 0) > CURRENT_SCHEMA_VERSION)
        throw new BackupBadRequestError('Backup schema is newer than this application');
      if (manifest.minimumAppVersion && isGreater(manifest.minimumAppVersion, env.appVersion))
        throw new BackupBadRequestError('Backup requires a newer application version');
    }
    if (Object.keys(outer.files).length > 4)
      throw new BackupBadRequestError('Backup archive contains too many entries');
    if (manifest.payloadSize > this.limits.maxArchiveBytes)
      throw new BackupBadRequestError('Backup payload is too large');
    const payloadFile = outer.file(manifest.encrypted ? 'payload.enc' : 'payload.zip');
    if (!payloadFile) throw new BackupBadRequestError('Backup payload is missing');
    const storedPayload = await payloadFile.async('nodebuffer');
    if (storedPayload.length !== manifest.payloadSize)
      throw new BackupBadRequestError('Backup payload size mismatch');
    if (sha256(storedPayload) !== manifest.checksumSha256)
      throw new BackupBadRequestError('Backup checksum mismatch');

    try {
      let payloadContent = storedPayload;
      if (manifest.encrypted) {
        if (!password) throw new BackupBadRequestError('Backup password is required');
        const cryptoFile = outer.file('crypto.json');
        if (!cryptoFile) throw new BackupBadRequestError('Backup encryption metadata is missing');
        const crypto = JSON.parse(await cryptoFile.async('string')) as {
          salt: string;
          iv: string;
          tag: string;
        };
        payloadContent = decryptPayload(
          storedPayload,
          password,
          Buffer.from(crypto.salt, 'base64'),
          Buffer.from(crypto.iv, 'base64'),
          Buffer.from(crypto.tag, 'base64')
        );
      }

      const payload = await JSZip.loadAsync(payloadContent);
      if (Object.keys(payload.files).length > this.limits.maxEntries)
        throw new BackupBadRequestError('Backup payload contains too many entries');
      const databaseFile = payload.file('database.sqlite');
      if (!databaseFile) throw new BackupBadRequestError('Backup database is missing');
      const settingsFile = payload.file('settings.json');
      const settings = settingsFile
        ? z.record(z.unknown()).parse(JSON.parse(await settingsFile.async('string')))
        : {};
      const database = await databaseFile.async('nodebuffer');
      if (database.length > this.limits.maxDatabaseBytes)
        throw new BackupBadRequestError('Backup database is too large');
      let totalCoverBytes = 0;
      const covers: Array<{ path: string; content: Buffer }> = [];
      for (const [path, entry] of Object.entries(payload.files)) {
        if (!entry.dir && path.startsWith('covers/')) {
          const cover = await entry.async('nodebuffer');
          if (cover.length > this.limits.maxCoverBytes)
            throw new BackupBadRequestError('Backup cover is too large');
          totalCoverBytes += cover.length;
          if (totalCoverBytes > this.limits.maxCoversBytes)
            throw new BackupBadRequestError('Backup covers are too large');
          covers.push({ path: path.slice('covers/'.length), content: cover });
        }
      }
      return { manifest, database, settings, covers };
    } catch (error) {
      if (error instanceof BackupBadRequestError) throw error;
      throw new BackupBadRequestError('Invalid or corrupted backup archive');
    }
  }
}
