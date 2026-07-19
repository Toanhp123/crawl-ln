import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  PluginStorePort,
  StoredPluginVersion
} from '../../../application/ports/plugin-store.port.js';
import type { RegisteredPlugin } from '../../../application/ports/plugin-registry.port.js';

const INTEGRITY_FAILURE = 'PACKAGE_INTEGRITY_FAILED';
const UNCHECKED_FILES = new Set(['checksums.json', 'signature.json']);
const REQUIRED_FILES = ['manifest.json', 'dist/index.js', 'checksums.json'];
const SHA256_HEX = /^[a-f0-9]{64}$/;

function safePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').some((segment) => segment === '..' || segment === '')
  );
}

async function listRegularFiles(root: string, directory = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
    if (!safePath(relativePath) || entry.isSymbolicLink()) {
      throw new Error(`Unsafe installed plugin path: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listRegularFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Unsupported installed plugin entry: ${relativePath}`);
    }
  }
  return files.sort();
}

function parseChecksums(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Malformed installed checksums.json');
  }
  const checksums: Record<string, string> = {};
  for (const [path, digest] of Object.entries(value)) {
    if (!safePath(path) || typeof digest !== 'string' || !SHA256_HEX.test(digest)) {
      throw new Error(`Invalid installed checksum entry for ${path}`);
    }
    checksums[path] = digest;
  }
  return checksums;
}

async function verifyInstalledPackage(version: StoredPluginVersion): Promise<void> {
  const rootStat = await lstat(version.packagePath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('Installed plugin root is not a regular directory');
  }

  const files = await listRegularFiles(version.packagePath);
  for (const required of REQUIRED_FILES) {
    if (!files.includes(required)) throw new Error(`Installed plugin is missing ${required}`);
  }

  const checksums = parseChecksums(
    JSON.parse(await readFile(join(version.packagePath, 'checksums.json'), 'utf8')) as unknown
  );
  const checkableFiles = files.filter((path) => !UNCHECKED_FILES.has(path));
  const checksumPaths = Object.keys(checksums).sort();
  if (
    checkableFiles.length !== checksumPaths.length ||
    checkableFiles.some((path, index) => path !== checksumPaths[index])
  ) {
    throw new Error('Installed checksums do not cover all package files');
  }

  for (const [path, expected] of Object.entries(checksums)) {
    const actual = createHash('sha256')
      .update(await readFile(join(version.packagePath, path)))
      .digest('hex');
    if (actual !== expected) throw new Error(`Installed checksum mismatch for ${path}`);
  }

  const manifest = JSON.parse(
    await readFile(join(version.packagePath, 'manifest.json'), 'utf8')
  ) as { id?: unknown; version?: unknown };
  if (manifest.id !== version.pluginId || manifest.version !== version.version) {
    throw new Error('Installed manifest identity does not match persisted plugin version');
  }
}

export class ExternalPluginLoader {
  constructor(private readonly store: PluginStorePort) {}

  async loadActive(): Promise<RegisteredPlugin[]> {
    const registrations: RegisteredPlugin[] = [];
    for (const version of await this.store.listActive()) {
      try {
        await verifyInstalledPackage(version);
      } catch {
        await this.store.quarantine(version.pluginId, version.version, INTEGRITY_FAILURE);
        continue;
      }
      registrations.push({
        plugin: { manifest: version.manifest },
        trustLevel: version.trustLevel,
        executionMode:
          version.trustLevel === 'local-unverified'
            ? 'isolated'
            : version.manifest.runtime.preferredMode,
        enabled: true,
        packagePath: version.packagePath
      });
    }
    return registrations;
  }
}
