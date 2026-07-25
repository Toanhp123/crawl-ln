import JSZip from 'jszip';
import { BackupBadRequestError } from '../../application/errors/backup.error.js';

export const BACKUP_ARCHIVE_LIMITS = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
  maxEntryBytes: 2 * 1024 * 1024 * 1024,
  maxEntries: 10_000,
  maxCompressionRatio: 100
} as const;

type ZipEntryInternals = JSZip.JSZipObject & {
  unsafeOriginalName?: string;
  _data?: {
    compressedSize?: number;
    uncompressedSize?: number;
  };
};

function unsafeArchive(message: string, details: Record<string, unknown> | null = null): never {
  throw new BackupBadRequestError(message, details ?? undefined);
}

function normalizedEntryName(entry: ZipEntryInternals): string {
  const original = entry.unsafeOriginalName ?? entry.name;
  if (original.includes('\0')) unsafeArchive('Backup archive entry contains a NUL byte');
  const slash = original.replace(/\\/g, '/');
  if (slash.startsWith('/') || /^[a-zA-Z]:\//.test(slash)) {
    unsafeArchive('Backup archive contains an absolute path');
  }
  const segments = slash.split('/').filter((segment) => segment.length > 0 && segment !== '.');
  if (segments.includes('..')) unsafeArchive('Backup archive contains path traversal');
  return segments.join('/');
}

function unixMode(entry: ZipEntryInternals): number | null {
  const value = entry.unixPermissions;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^[0-7]+$/.test(value)) return Number.parseInt(value, 8);
  return null;
}

export function assertSafeZipEntries(zip: JSZip, label: 'outer archive' | 'inner payload'): void {
  const entries = Object.values(zip.files) as ZipEntryInternals[];
  if (entries.length > BACKUP_ARCHIVE_LIMITS.maxEntries) {
    unsafeArchive(`Backup ${label} contains too many entries`, {
      maxEntries: BACKUP_ARCHIVE_LIMITS.maxEntries
    });
  }

  let totalUncompressed = 0;
  for (const entry of entries) {
    normalizedEntryName(entry);
    const mode = unixMode(entry);
    if (mode !== null && (mode & 0o170000) === 0o120000) {
      unsafeArchive(`Backup ${label} contains a symbolic link`);
    }
    if (entry.dir) continue;

    const uncompressed = Number(entry._data?.uncompressedSize ?? 0);
    const compressed = Number(entry._data?.compressedSize ?? 0);
    if (!Number.isSafeInteger(uncompressed) || uncompressed < 0) {
      unsafeArchive(`Backup ${label} contains an invalid entry size`);
    }
    if (uncompressed > BACKUP_ARCHIVE_LIMITS.maxEntryBytes) {
      unsafeArchive(`Backup ${label} entry is too large`, {
        maxEntryBytes: BACKUP_ARCHIVE_LIMITS.maxEntryBytes
      });
    }
    totalUncompressed += uncompressed;
    if (totalUncompressed > BACKUP_ARCHIVE_LIMITS.maxUncompressedBytes) {
      unsafeArchive(`Backup ${label} expands beyond the allowed size`, {
        maxUncompressedBytes: BACKUP_ARCHIVE_LIMITS.maxUncompressedBytes
      });
    }
    if (uncompressed > 0) {
      const ratio = compressed <= 0 ? Number.POSITIVE_INFINITY : uncompressed / compressed;
      if (ratio > BACKUP_ARCHIVE_LIMITS.maxCompressionRatio) {
        unsafeArchive(`Backup ${label} compression ratio is unsafe`, {
          maxCompressionRatio: BACKUP_ARCHIVE_LIMITS.maxCompressionRatio
        });
      }
    }
  }
}

export async function loadSafeZip(
  content: Buffer,
  label: 'outer archive' | 'inner payload'
): Promise<JSZip> {
  if (content.length > BACKUP_ARCHIVE_LIMITS.maxArchiveBytes) {
    unsafeArchive('Backup archive is too large', {
      maxArchiveBytes: BACKUP_ARCHIVE_LIMITS.maxArchiveBytes
    });
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(content, { createFolders: false });
  } catch {
    throw new BackupBadRequestError(`Invalid backup ${label}`);
  }
  assertSafeZipEntries(zip, label);
  return zip;
}

export function assertSafeStagingName(name: string): void {
  const slash = name.replace(/\\/g, '/');
  if (
    slash.includes('\0') ||
    slash.startsWith('/') ||
    /^[a-zA-Z]:\//.test(slash) ||
    slash.split('/').includes('..')
  ) {
    unsafeArchive('Backup staging path is unsafe');
  }
}
