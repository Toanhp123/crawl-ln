import type { SourceDataCapability } from '@novel-tool/source-plugin-sdk';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import type { PluginPackageVerifierPort } from '../../../application/ports/plugin-package-verifier.port.js';
import type {
  InspectedSourcePluginArchive,
  SourcePluginArchiveInspectorPort
} from '../../../application/ports/source-plugin-archive-inspector.port.js';
import { parseSourcePluginManifest } from '../../../domain/plugin/source-plugin-manifest.schema.js';
import { assertSourcePluginStudioFiles } from '../studio/source-plugin-studio.builder.js';
import {
  loadSafeSourcePluginArchive,
  type SafeSourcePluginArchiveEntry
} from './source-plugin-archive-safety.js';

const FIXED_ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');
const BUILT_FILES = ['manifest.json', 'dist/index.js', 'checksums.json'] as const;
const SOURCE_FILES = ['manifest.json', 'src/index.ts'] as const;

interface ArchiveCandidate {
  root: string;
  built: boolean;
  source: boolean;
  npmWorkspace: boolean;
}

interface NormalizedArchiveEntry {
  path: string;
  entry: SafeSourcePluginArchiveEntry;
}

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function candidateRoot(path: string): string | undefined {
  if (path === 'manifest.json') return '';
  if (!path.endsWith('/manifest.json')) return undefined;
  const root = path.slice(0, -'manifest.json'.length);
  return root.split('/').filter(Boolean).length === 1 ? root : undefined;
}

function findCandidates(entries: SafeSourcePluginArchiveEntry[]): ArchiveCandidate[] {
  const paths = new Set(entries.map((entry) => entry.path));
  const candidates = new Map<string, ArchiveCandidate>();
  for (const entry of entries) {
    const root = candidateRoot(entry.path);
    if (root === undefined || candidates.has(root)) continue;
    const has = (path: string) => paths.has(`${root}${path}`);
    const built = BUILT_FILES.every(has);
    const source = SOURCE_FILES.every(has);
    if (!built && !source) continue;
    candidates.set(root, {
      root,
      built,
      source,
      npmWorkspace: source && has('package.json')
    });
  }
  return [...candidates.values()];
}

function normalizeEntries(
  entries: SafeSourcePluginArchiveEntry[],
  root: string
): NormalizedArchiveEntry[] {
  if (root && entries.some((entry) => !entry.path.startsWith(root))) {
    throw new Error('Source plugin archive contains files outside the plugin root');
  }
  return entries.map((entry) => ({
    path: root ? entry.path.slice(root.length) : entry.path,
    entry
  }));
}

function isStudioSourcePath(path: string): boolean {
  return path === 'manifest.json' || path.startsWith('src/') || path.startsWith('tests/');
}

async function readUtf8(entry: NormalizedArchiveEntry): Promise<string> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await entry.entry.read());
  } catch (error) {
    throw new Error(`Plugin Studio source file is not valid UTF-8 text: ${entry.path}`, {
      cause: error
    });
  }
}

function parseJson(value: string, fileName: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`Malformed ${fileName}`, { cause: error });
  }
}

async function normalizedBuiltArtifact(entries: NormalizedArchiveEntry[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.path, await entry.entry.read(), {
      date: FIXED_ZIP_DATE,
      unixPermissions: 0o100644,
      createFolders: false
    });
  }
  return zip.generateAsync({
    type: 'uint8array',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
}

export class SourcePluginArchiveInspector implements SourcePluginArchiveInspectorPort {
  constructor(private readonly verifier: PluginPackageVerifierPort) {}

  async inspect(input: {
    bytes: Uint8Array;
    originalName: string;
  }): Promise<InspectedSourcePluginArchive> {
    const archive = await loadSafeSourcePluginArchive(input.bytes);
    const candidates = findCandidates(archive.entries);
    if (candidates.length === 0) {
      throw new Error('Unsupported source plugin archive layout');
    }
    if (candidates.length > 1) {
      throw new Error('Source plugin archive contains multiple plugin roots');
    }

    const candidate = candidates[0]!;
    const entries = normalizeEntries(archive.entries, candidate.root);
    const uploadChecksum = checksum(input.bytes);

    if (candidate.built) {
      const artifactBytes = candidate.root ? await normalizedBuiltArtifact(entries) : input.bytes;
      const verified = await this.verifier.verify(artifactBytes);
      return {
        preview: {
          checksum: uploadChecksum,
          kind: 'built-package',
          pluginId: verified.manifest.id,
          name: verified.manifest.name,
          version: verified.manifest.version,
          hosts: [...verified.manifest.permissions.network.hosts],
          capabilities: [...verified.manifest.capabilities],
          files: entries.map((entry) => entry.path).sort(),
          ignoredFiles: []
        },
        artifact: {
          bytes: artifactBytes,
          fileName: `${verified.manifest.id}-${verified.manifest.version}.source-plugin`
        }
      };
    }

    const sourceEntries = entries.filter((entry) => isStudioSourcePath(entry.path));
    const sourceFiles = Object.fromEntries(
      await Promise.all(sourceEntries.map(async (entry) => [entry.path, await readUtf8(entry)]))
    );
    assertSourcePluginStudioFiles(sourceFiles);
    const manifest = parseSourcePluginManifest(
      parseJson(sourceFiles['manifest.json']!, 'manifest.json')
    );
    const capabilities = manifest.capabilities.filter(
      (capability): capability is SourceDataCapability => capability !== 'authentication'
    );
    if (capabilities.length === 0) {
      throw new Error('Plugin Studio source requires at least one reader capability');
    }

    const files = Object.keys(sourceFiles).sort();
    return {
      preview: {
        checksum: uploadChecksum,
        kind: candidate.npmWorkspace ? 'npm-workspace' : 'studio-source',
        pluginId: manifest.id,
        name: manifest.name,
        version: manifest.version,
        hosts: [...manifest.permissions.network.hosts],
        capabilities: [...manifest.capabilities],
        files,
        ignoredFiles: entries
          .map((entry) => entry.path)
          .filter((path) => !isStudioSourcePath(path))
          .sort()
      },
      source: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        hosts: [...manifest.permissions.network.hosts],
        capabilities,
        selectors: {},
        files: sourceFiles
      }
    };
  }
}
