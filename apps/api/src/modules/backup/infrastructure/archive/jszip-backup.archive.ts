import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { z } from 'zod';
import {
  BackupBadRequestError,
  BackupOperationError,
  BackupPasswordInvalidError
} from '../../application/errors/backup.error.js';
import type {
  BackupArchiveCreateHooks,
  BackupArchivePort,
  OpenedBackup
} from '../../application/ports/backup-archive.port.js';
import type { BackupManifest, BackupSnapshot } from '../../domain/backup.models.js';
import { assertSafeZipEntries, loadSafeZip } from './backup-archive-safety.js';
import { decryptPayload, encryptPayload } from '../crypto/backup-crypto.js';

const manifestSchema = z
  .object({
    format: z.literal('novel-tool-backup'),
    formatVersion: z.literal(3),
    appVersion: z.string().min(1),
    schemaVersion: z.number().int().nonnegative(),
    createdAt: z.string().datetime({ offset: true }),
    encrypted: z.boolean(),
    algorithm: z.enum(['none', 'aes-256-gcm']),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    payloadSize: z.number().int().nonnegative()
  })
  .strict();

const cryptoMetadataSchema = z
  .object({
    salt: z.string().min(1),
    iv: z.string().min(1),
    tag: z.string().min(1)
  })
  .strict();

const jsonRecordSchema = z.record(z.unknown());

export interface BackupArchiveLimits {
  maxArchiveBytes: number;
  maxDatabaseBytes: number;
  maxMetadataBytes: number;
  maxEntries: number;
}

const DEFAULT_LIMITS: BackupArchiveLimits = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxDatabaseBytes: 384 * 1024 * 1024,
  maxMetadataBytes: 16 * 1024 * 1024,
  maxEntries: 10_000
};

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function parseJsonRecord(content: string, label: string): Record<string, unknown> {
  try {
    return jsonRecordSchema.parse(JSON.parse(content));
  } catch (error) {
    throw new BackupBadRequestError(`Invalid backup ${label}`, error);
  }
}

interface ReadEnvelopeResult {
  outer: JSZip;
  manifest: BackupManifest;
  storedPayload: Buffer;
}

export class JsZipBackupArchive implements BackupArchivePort {
  private readonly limits: BackupArchiveLimits;

  constructor(
    private readonly options: { appVersion: string; schemaVersion: number },
    limits: Partial<BackupArchiveLimits> = {}
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  async create(
    snapshot: BackupSnapshot,
    password?: string,
    hooks: BackupArchiveCreateHooks = {}
  ): Promise<{ content: Buffer; manifest: BackupManifest }> {
    if (snapshot.database.length > this.limits.maxDatabaseBytes) {
      throw new BackupBadRequestError('Backup database is too large');
    }
    hooks.throwIfCancelled?.();
    const contributors = Buffer.from(JSON.stringify(snapshot.contributors, null, 2));
    const settings = Buffer.from(JSON.stringify(snapshot.settings, null, 2));
    if (contributors.length + settings.length > this.limits.maxMetadataBytes) {
      throw new BackupBadRequestError('Backup metadata is too large');
    }

    const payload = new JSZip();
    payload.file('database.sqlite', snapshot.database);
    payload.file('contributors.json', contributors);
    payload.file('settings.json', settings);
    hooks.onStage?.('archiving');
    const payloadContent = await payload.generateAsync(
      {
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      },
      () => hooks.throwIfCancelled?.()
    );
    if (payloadContent.length > this.limits.maxArchiveBytes) {
      throw new BackupBadRequestError('Backup payload is too large');
    }

    const outer = new JSZip();
    const encrypted = Boolean(password);
    let storedPayload = payloadContent;
    if (password) {
      hooks.throwIfCancelled?.();
      hooks.onStage?.('encrypting');
      const encryptedPayload = encryptPayload(payloadContent, password);
      storedPayload = encryptedPayload.encrypted;
      outer.file(
        'crypto.json',
        JSON.stringify({
          salt: encryptedPayload.salt.toString('base64'),
          iv: encryptedPayload.iv.toString('base64'),
          tag: encryptedPayload.tag.toString('base64')
        })
      );
    }

    const manifest: BackupManifest = {
      format: 'novel-tool-backup',
      formatVersion: 3,
      appVersion: this.options.appVersion,
      schemaVersion: this.options.schemaVersion,
      createdAt: new Date().toISOString(),
      encrypted,
      algorithm: encrypted ? 'aes-256-gcm' : 'none',
      checksumSha256: sha256(storedPayload),
      payloadSize: storedPayload.length
    };
    hooks.throwIfCancelled?.();
    outer.file('manifest.json', JSON.stringify(manifest, null, 2));
    outer.file(encrypted ? 'payload.enc' : 'payload.zip', storedPayload);
    const content = await outer.generateAsync({ type: 'nodebuffer', compression: 'STORE' }, () =>
      hooks.throwIfCancelled?.()
    );
    hooks.throwIfCancelled?.();
    if (content.length > this.limits.maxArchiveBytes) {
      throw new BackupBadRequestError('Backup archive is too large');
    }
    return { content, manifest };
  }

  async readManifest(content: Buffer): Promise<BackupManifest> {
    return (await this.readEnvelope(content)).manifest;
  }

  async open(content: Buffer, password?: string): Promise<OpenedBackup> {
    const envelope = await this.readEnvelope(content);
    if (envelope.manifest.schemaVersion > this.options.schemaVersion) {
      throw new BackupOperationError(
        'BACKUP_SCHEMA_NEWER_THAN_APP',
        422,
        'Backup schema is newer than this application',
        false,
        {
          sourceSchemaVersion: envelope.manifest.schemaVersion,
          targetSchemaVersion: this.options.schemaVersion
        }
      );
    }

    try {
      let payloadContent = envelope.storedPayload;
      if (envelope.manifest.encrypted) {
        if (!password) throw new BackupBadRequestError('Backup password is required');
        const cryptoFile = envelope.outer.file('crypto.json');
        if (!cryptoFile) throw new BackupBadRequestError('Backup encryption metadata is missing');
        const crypto = cryptoMetadataSchema.parse(JSON.parse(await cryptoFile.async('string')));
        const salt = Buffer.from(crypto.salt, 'base64');
        const iv = Buffer.from(crypto.iv, 'base64');
        const tag = Buffer.from(crypto.tag, 'base64');
        if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) {
          throw new BackupBadRequestError('Invalid backup encryption metadata');
        }
        payloadContent = decryptPayload(envelope.storedPayload, password, salt, iv, tag);
      }

      const payload = await loadSafeZip(payloadContent, 'inner payload');
      if (Object.keys(payload.files).length > this.limits.maxEntries) {
        throw new BackupBadRequestError('Backup payload contains too many entries');
      }
      const databaseFile = payload.file('database.sqlite');
      const contributorsFile = payload.file('contributors.json');
      if (!databaseFile) throw new BackupBadRequestError('Backup database is missing');
      if (!contributorsFile) {
        throw new BackupBadRequestError('Backup contributor data is missing');
      }
      const settingsFile = payload.file('settings.json');
      const database = await databaseFile.async('nodebuffer');
      if (database.length > this.limits.maxDatabaseBytes) {
        throw new BackupBadRequestError('Backup database is too large');
      }
      const contributorsText = await contributorsFile.async('string');
      const settingsText = settingsFile ? await settingsFile.async('string') : '{}';
      if (
        Buffer.byteLength(contributorsText) + Buffer.byteLength(settingsText) >
        this.limits.maxMetadataBytes
      ) {
        throw new BackupBadRequestError('Backup metadata is too large');
      }
      return {
        manifest: envelope.manifest,
        database,
        contributors: parseJsonRecord(contributorsText, 'contributor data'),
        settings: parseJsonRecord(settingsText, 'settings')
      };
    } catch (error) {
      if (
        error instanceof BackupBadRequestError ||
        error instanceof BackupOperationError ||
        error instanceof BackupPasswordInvalidError
      ) {
        throw error;
      }
      throw new BackupBadRequestError('Invalid or corrupted backup archive', error);
    }
  }

  private async readEnvelope(content: Buffer): Promise<ReadEnvelopeResult> {
    if (content.length > this.limits.maxArchiveBytes) {
      throw new BackupBadRequestError('Backup archive is too large');
    }
    const outer = await loadSafeZip(content, 'outer archive');
    assertSafeZipEntries(outer, 'outer archive');
    if (Object.keys(outer.files).length > this.limits.maxEntries) {
      throw new BackupBadRequestError('Backup archive contains too many entries');
    }

    const manifestFile = outer.file('manifest.json');
    if (!manifestFile) throw new BackupBadRequestError('Backup manifest is missing');
    let manifest: BackupManifest;
    try {
      manifest = manifestSchema.parse(JSON.parse(await manifestFile.async('string')));
    } catch (error) {
      throw new BackupBadRequestError('Invalid backup manifest', error);
    }
    if (manifest.encrypted !== (manifest.algorithm === 'aes-256-gcm')) {
      throw new BackupBadRequestError('Backup encryption manifest is inconsistent');
    }

    const payloadName = manifest.encrypted ? 'payload.enc' : 'payload.zip';
    const payloadFile = outer.file(payloadName);
    if (!payloadFile) throw new BackupBadRequestError('Backup payload is missing');
    const storedPayload = await payloadFile.async('nodebuffer');
    if (storedPayload.length !== manifest.payloadSize) {
      throw new BackupBadRequestError('Backup payload size mismatch');
    }
    if (sha256(storedPayload) !== manifest.checksumSha256) {
      throw new BackupBadRequestError('Backup checksum mismatch');
    }

    if (manifest.encrypted) {
      const cryptoFile = outer.file('crypto.json');
      if (!cryptoFile) throw new BackupBadRequestError('Backup encryption metadata is missing');
      try {
        const crypto = cryptoMetadataSchema.parse(JSON.parse(await cryptoFile.async('string')));
        const salt = Buffer.from(crypto.salt, 'base64');
        const iv = Buffer.from(crypto.iv, 'base64');
        const tag = Buffer.from(crypto.tag, 'base64');
        if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) {
          throw new Error('invalid crypto lengths');
        }
      } catch (error) {
        throw new BackupBadRequestError('Invalid backup encryption metadata', error);
      }
    }

    return { outer, manifest, storedPayload };
  }
}
