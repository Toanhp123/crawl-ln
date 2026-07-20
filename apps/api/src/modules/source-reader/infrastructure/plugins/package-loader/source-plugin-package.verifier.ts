import { createHash, verify as verifySignature } from 'node:crypto';
import JSZip from 'jszip';
import type {
  PluginPackageVerifierPort,
  VerifiedPluginPackage
} from '../../../application/ports/plugin-package-verifier.port.js';
import type { TrustStorePort } from '../../../application/ports/trust-store.port.js';
import { parseSourcePluginManifest } from '../../../domain/plugin/source-plugin-manifest.schema.js';

const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 500;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const REQUIRED_FILES = ['manifest.json', 'dist/index.js', 'checksums.json'] as const;
const UNCHECKED_FILES = new Set(['checksums.json', 'signature.json']);
const SHA256_HEX = /^[a-f0-9]{64}$/;

function safePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').some((segment) => segment === '..' || segment === '')
  );
}

function unixMode(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseInt(value, 8);
  return 0;
}

function forbiddenExecutableMagic(content: Uint8Array): boolean {
  if (content.length >= 4) {
    const first4 = Buffer.from(content.subarray(0, 4)).toString('hex');
    if (
      first4 === '7f454c46' ||
      ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca'].includes(first4)
    ) {
      return true;
    }
  }
  return content.length >= 2 && content[0] === 0x4d && content[1] === 0x5a;
}

function assertArchiveEntryPolicy(entry: JSZip.JSZipObject): void {
  const originalPath = entry.unsafeOriginalName ?? entry.name;
  if (!safePath(originalPath) || !safePath(entry.name)) {
    throw new Error(`Unsafe package path: ${originalPath}`);
  }
  const mode = unixMode(entry.unixPermissions);
  if ((mode & 0o170000) === 0o120000) {
    throw new Error(`Symbolic links are forbidden in plugin packages: ${entry.name}`);
  }
  if ((mode & 0o111) !== 0) {
    throw new Error(`Executable permission bits are forbidden: ${entry.name}`);
  }
  if (entry.name.toLowerCase().endsWith('.node')) {
    throw new Error(`Native addons are forbidden: ${entry.name}`);
  }
}

function text(files: Map<string, Uint8Array>, path: string): string {
  const value = files.get(path);
  if (!value) throw new Error(`Missing ${path}`);
  return Buffer.from(value).toString('utf8');
}

function parseJson(value: string, file: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`Malformed ${file}`, { cause: error });
  }
}

function parseChecksums(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Malformed checksums.json');
  }
  const checksums: Record<string, string> = {};
  for (const [path, digest] of Object.entries(value)) {
    if (!safePath(path) || typeof digest !== 'string' || !SHA256_HEX.test(digest)) {
      throw new Error(`Invalid checksum entry for ${path}`);
    }
    checksums[path] = digest;
  }
  return checksums;
}

interface SignatureDocument {
  keyId: string;
  algorithm: 'ed25519';
  signature: string;
}

function parseSignature(value: unknown): SignatureDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Malformed signature.json');
  }
  const document = value as Partial<SignatureDocument>;
  if (
    typeof document.keyId !== 'string' ||
    document.keyId.length === 0 ||
    document.algorithm !== 'ed25519' ||
    typeof document.signature !== 'string' ||
    document.signature.length === 0
  ) {
    throw new Error('Malformed signature.json');
  }
  return document as SignatureDocument;
}

export class SourcePluginPackageVerifier implements PluginPackageVerifierPort {
  constructor(private readonly trustStore: TrustStorePort) {}

  async verify(bytes: Uint8Array): Promise<VerifiedPluginPackage> {
    if (bytes.byteLength > MAX_PACKAGE_BYTES) {
      throw new Error('Plugin package exceeds size limit');
    }

    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    if (entries.length > MAX_FILES) throw new Error('Plugin package contains too many files');

    for (const entry of entries) assertArchiveEntryPolicy(entry);
    for (const file of REQUIRED_FILES) {
      if (!zip.file(file)) throw new Error(`Missing ${file}`);
    }

    const files = new Map<string, Uint8Array>();
    let uncompressedBytes = 0;
    for (const entry of entries) {
      const content = await entry.async('uint8array');
      uncompressedBytes += content.byteLength;
      if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new Error('Plugin package expands beyond limit');
      }
      if (forbiddenExecutableMagic(content)) {
        throw new Error(`Executable binary content is forbidden: ${entry.name}`);
      }
      files.set(entry.name, content);
    }

    const manifest = parseSourcePluginManifest(
      parseJson(text(files, 'manifest.json'), 'manifest.json')
    );
    const checksums = parseChecksums(parseJson(text(files, 'checksums.json'), 'checksums.json'));
    const checkableFiles = [...files.keys()].filter((path) => !UNCHECKED_FILES.has(path)).sort();
    const checksumPaths = Object.keys(checksums).sort();
    if (
      checkableFiles.length !== checksumPaths.length ||
      checkableFiles.some((path, index) => path !== checksumPaths[index])
    ) {
      throw new Error('Checksums must cover every package file except signature metadata');
    }

    for (const [path, expected] of Object.entries(checksums)) {
      const content = files.get(path);
      if (!content) throw new Error(`Checksum references missing file ${path}`);
      const actual = createHash('sha256').update(content).digest('hex');
      if (actual !== expected) throw new Error(`Checksum mismatch for ${path}`);
    }

    const packageChecksum = createHash('sha256').update(bytes).digest('hex');
    const signatureBytes = files.get('signature.json');
    if (!signatureBytes) {
      return {
        manifest,
        files,
        packageChecksum,
        signatureStatus: 'unsigned',
        trustLevel: 'local-unverified',
        executionMode: 'isolated'
      };
    }

    const signature = parseSignature(
      parseJson(Buffer.from(signatureBytes).toString('utf8'), 'signature.json')
    );
    const key = await this.trustStore.find(signature.keyId);
    if (!key || key.algorithm !== signature.algorithm) {
      throw new Error(`Untrusted signing key ${signature.keyId}`);
    }
    const signedPayload = Buffer.from(JSON.stringify({ manifest, checksums }));
    const valid = verifySignature(
      null,
      signedPayload,
      key.publicKeyPem,
      Buffer.from(signature.signature, 'base64')
    );
    if (!valid) throw new Error('Plugin signature is invalid');

    return {
      manifest,
      files,
      packageChecksum,
      signatureStatus: 'valid',
      trustLevel: 'signed',
      executionMode: manifest.runtime.preferredMode,
      signerKeyId: signature.keyId
    };
  }
}
