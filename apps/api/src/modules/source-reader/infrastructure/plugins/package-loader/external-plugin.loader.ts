import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  PluginStorePort,
  StoredPluginVersion
} from '../../../application/ports/plugin-store.port.js';
import type { RegisteredPlugin } from '../../../application/ports/plugin-registry.port.js';
import type { ExternalPluginSupervisorPort } from '../../../application/ports/external-plugin-supervisor.port.js';
import type { PluginLifecycle } from '../../../domain/plugin/plugin-lifecycle.js';
import type { SourceReaderPlugin } from '../../../domain/plugin/source-plugin.js';
import type { AuthExecutionResult } from '../../../domain/auth/authentication.js';
import type {
  ExternalLoginRequest,
  ExternalProbeRequest,
  ExternalResumeChallengeRequest
} from '../../../domain/plugin/external-auth-rpc.js';
import { SANDBOX_PROTOCOL_VERSION } from '../../runtime/external-process/sandbox-protocol.js';

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

interface ExternalLoaderOptions {
  supervisor: ExternalPluginSupervisorPort;
  timeoutMs: number;
  now(): Date;
  randomId?(): string;
}

export class ExternalPluginLoader {
  constructor(
    private readonly store: PluginStorePort,
    private readonly options?: ExternalLoaderOptions
  ) {}

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
        plugin: this.plugin(version),
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

  private plugin(version: StoredPluginVersion): SourceReaderPlugin {
    const manifest = {
      ...version.manifest,
      extensionContracts: version.activatedExtensions ?? version.manifest.extensionContracts ?? {}
    };
    if (!this.options) return { manifest };
    return {
      manifest,
      lifecycle: this.lifecycle(version),
      canHandle: async (request) =>
        Boolean(
          await this.request(version, 'probeCanHandle', {
            normalizedUrl: request.normalizedUrl,
            domain: request.domain,
            capability: request.capability
          } satisfies ExternalProbeRequest)
        ),
      ...(manifest.capabilities.includes('authentication')
        ? {
            authentication: {
              login: async (request) =>
                (await this.request(version, 'login', {
                  strategy: 'custom',
                  fields: request.fields ?? {},
                  routeIdentity: request.routeIdentity ?? 'direct'
                } satisfies ExternalLoginRequest)) as AuthExecutionResult,
              resumeChallenge: async (request) => {
                const response = Object.fromEntries(
                  Object.entries(request.response).flatMap(([key, value]) =>
                    typeof value === 'string' ? [[key, value]] : []
                  )
                );
                return (await this.request(version, 'resumeChallenge', {
                  challengeType: request.challengeType ?? 'unknown',
                  response,
                  opaqueState: request.opaqueState ?? {},
                  routeIdentity: request.routeIdentity ?? 'direct'
                } satisfies ExternalResumeChallengeRequest)) as AuthExecutionResult;
              }
            }
          }
        : {})
    };
  }

  private lifecycle(version: StoredPluginVersion): PluginLifecycle {
    return {
      initialize: async (context) => {
        await this.request(version, 'initialize', {
          ...context,
          protocolVersion: SANDBOX_PROTOCOL_VERSION
        });
      },
      healthCheck: async () =>
        (await this.request(version, 'healthCheck', {})) as {
          status: 'healthy' | 'degraded';
          details?: Record<string, string>;
        },
      shutdown: async (reason) => {
        try {
          await this.request(version, 'shutdown', { reason });
        } finally {
          await this.options?.supervisor.stop(version.pluginId, version.version, reason);
        }
      }
    };
  }

  private async request(
    version: StoredPluginVersion,
    operation:
      'initialize' | 'healthCheck' | 'shutdown' | 'probeCanHandle' | 'login' | 'resumeChallenge',
    payload: Record<string, unknown>
  ): Promise<unknown> {
    const options = this.options;
    if (!options) throw new Error('External plugin supervisor is unavailable');
    const handle =
      options.supervisor.get(version.pluginId, version.version) ??
      (await options.supervisor.start({
        pluginId: version.pluginId,
        pluginVersion: version.version,
        packageRoot: version.packagePath,
        entryPath: join(version.packagePath, 'dist/index.js')
      }));
    return handle.request(
      {
        requestId: options.randomId?.() ?? randomUUID(),
        operation,
        deadlineAt: new Date(options.now().getTime() + options.timeoutMs).toISOString(),
        payload
      },
      new AbortController().signal
    );
  }
}
