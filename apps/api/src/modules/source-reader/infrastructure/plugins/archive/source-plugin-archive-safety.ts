import JSZip from 'jszip';

export const SOURCE_PLUGIN_ARCHIVE_LIMITS = {
  maxArchiveBytes: 20 * 1024 * 1024,
  maxEntries: 500,
  maxUncompressedBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 100
} as const;

export interface SafeSourcePluginArchiveEntry {
  path: string;
  compressedBytes: number;
  uncompressedBytes: number;
  read(): Promise<Uint8Array>;
}

type ZipEntryInternals = JSZip.JSZipObject & {
  unsafeOriginalName?: string;
  _data?: {
    compressedSize?: number;
    uncompressedSize?: number;
  };
};

function unixMode(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^[0-7]+$/.test(value)) return Number.parseInt(value, 8);
  return 0;
}

function assertSafePath(path: string, directory: boolean): void {
  const candidate = directory && path.endsWith('/') ? path.slice(0, -1) : path;
  const segments = candidate.split('/');
  if (
    candidate.length === 0 ||
    candidate.includes('\0') ||
    candidate.includes('\\') ||
    candidate.startsWith('/') ||
    /^[a-zA-Z]:\//.test(candidate) ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error(`Unsafe source plugin archive path: ${path}`);
  }
}

function entrySizes(entry: ZipEntryInternals): {
  compressedBytes: number;
  uncompressedBytes: number;
} {
  const compressedBytes = Number(entry._data?.compressedSize);
  const uncompressedBytes = Number(entry._data?.uncompressedSize);
  if (
    !Number.isSafeInteger(compressedBytes) ||
    compressedBytes < 0 ||
    !Number.isSafeInteger(uncompressedBytes) ||
    uncompressedBytes < 0
  ) {
    throw new Error(`Source plugin archive has invalid entry sizes: ${entry.name}`);
  }
  return { compressedBytes, uncompressedBytes };
}

export async function loadSafeSourcePluginArchive(
  bytes: Uint8Array
): Promise<{ entries: SafeSourcePluginArchiveEntry[] }> {
  if (bytes.byteLength > SOURCE_PLUGIN_ARCHIVE_LIMITS.maxArchiveBytes) {
    throw new Error('Source plugin archive exceeds size limit');
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  } catch (error) {
    throw new Error('Invalid source plugin archive', { cause: error });
  }

  const archiveEntries = Object.values(zip.files) as ZipEntryInternals[];
  if (archiveEntries.length > SOURCE_PLUGIN_ARCHIVE_LIMITS.maxEntries) {
    throw new Error('Source plugin archive contains too many entries');
  }

  const safeEntries: SafeSourcePluginArchiveEntry[] = [];
  let totalUncompressedBytes = 0;
  for (const entry of archiveEntries) {
    const originalPath = entry.unsafeOriginalName ?? entry.name;
    assertSafePath(originalPath, entry.dir);
    assertSafePath(entry.name, entry.dir);

    const mode = unixMode(entry.unixPermissions);
    if ((mode & 0o170000) === 0o120000) {
      throw new Error(`Symbolic links are forbidden in source plugin archives: ${entry.name}`);
    }
    if (entry.dir) continue;
    if ((mode & 0o111) !== 0) {
      throw new Error(`Executable permission bits are forbidden: ${entry.name}`);
    }

    const { compressedBytes, uncompressedBytes } = entrySizes(entry);
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > SOURCE_PLUGIN_ARCHIVE_LIMITS.maxUncompressedBytes) {
      throw new Error('Source plugin archive expands beyond limit');
    }
    if (
      uncompressedBytes > 0 &&
      (compressedBytes === 0 ||
        uncompressedBytes / compressedBytes > SOURCE_PLUGIN_ARCHIVE_LIMITS.maxCompressionRatio)
    ) {
      throw new Error(`Source plugin archive compression ratio is unsafe: ${entry.name}`);
    }

    safeEntries.push({
      path: entry.name,
      compressedBytes,
      uncompressedBytes,
      read: () => entry.async('uint8array')
    });
  }

  safeEntries.sort((left, right) => left.path.localeCompare(right.path));
  return { entries: safeEntries };
}
