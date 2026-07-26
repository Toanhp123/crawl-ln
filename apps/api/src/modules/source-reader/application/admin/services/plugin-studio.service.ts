import type { SourceDataCapability } from '@novel-tool/source-plugin-sdk';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ExternalPluginSupervisorPort } from '../../ports/external-plugin-supervisor.port.js';
import type { PluginPackageVerifierPort } from '../../ports/plugin-package-verifier.port.js';
import type {
  PluginStudioDraftRepository,
  SourcePluginStudioDraft,
  SourcePluginStudioSelectors
} from '../../ports/plugin-studio-draft.repository.js';
import type { PluginStudioBuilderPort } from '../../ports/plugin-studio-builder.port.js';

type FailureKind = 'validation' | 'not_found' | 'conflict';

class PluginStudioFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'PluginStudioFailure';
  }
}

interface Installer {
  install(input: { bytes: Uint8Array; originalName: string }): Promise<Record<string, unknown>>;
}

interface PluginStudioServiceOptions {
  drafts: PluginStudioDraftRepository;
  builder: PluginStudioBuilderPort;
  verifier: PluginPackageVerifierPort;
  installer: Installer;
  testSupervisor?: ExternalPluginSupervisorPort;
  ids: { randomId(): string };
  clock: { now(): Date };
}

export interface CreatePluginStudioProjectInput {
  name: string;
  pluginId: string;
  version: string;
  hosts: string[];
  capabilities: SourceDataCapability[];
  selectors: SourcePluginStudioSelectors;
}

export interface UpdatePluginStudioProjectInput {
  expectedRevision: number;
  name?: string;
  pluginId?: string;
  version?: string;
  hosts?: string[];
  capabilities?: SourceDataCapability[];
  selectors?: SourcePluginStudioSelectors;
  files?: Record<string, string>;
}

const supportedCapabilities = new Set<SourceDataCapability>([
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content'
]);

function normalizedHosts(hosts: string[]): string[] {
  const normalized = hosts.map((value) => {
    const host = value.trim().toLowerCase().replace(/\.$/, '');
    if (
      !host ||
      host.includes('://') ||
      host.includes('/') ||
      host.includes(':') ||
      host.includes('*') ||
      /\s/.test(host) ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
    ) {
      throw new PluginStudioFailure('validation', `Invalid source hostname: ${value}`);
    }
    return host;
  });
  const unique = [...new Set(normalized)];
  if (unique.length === 0) {
    throw new PluginStudioFailure('validation', 'At least one source hostname is required');
  }
  return unique;
}

function normalizedCapabilities(capabilities: SourceDataCapability[]): SourceDataCapability[] {
  const unique = [...new Set(capabilities)];
  if (unique.length === 0 || unique.some((item) => !supportedCapabilities.has(item))) {
    throw new PluginStudioFailure(
      'validation',
      'Plugin Studio supports identify, metadata, chapter-list and chapter-content'
    );
  }
  return unique;
}

function publicDraft(draft: SourcePluginStudioDraft) {
  return {
    ...draft,
    revision: draft.revision ?? 1,
    build: draft.artifactChecksum
      ? {
          checksum: draft.artifactChecksum,
          revision: draft.builtRevision,
          stale: draft.builtRevision !== draft.revision
        }
      : undefined
  };
}

export class PluginStudioService {
  constructor(private readonly options: PluginStudioServiceOptions) {}

  async create(input: CreatePluginStudioProjectInput) {
    const now = this.options.clock.now().toISOString();
    const project = {
      id: this.options.ids.randomId(),
      name: input.name.trim(),
      pluginId: input.pluginId.trim(),
      version: input.version.trim(),
      hosts: normalizedHosts(input.hosts),
      capabilities: normalizedCapabilities(input.capabilities),
      selectors: input.selectors,
      files: {},
      revision: 1,
      createdAt: now,
      updatedAt: now
    } satisfies SourcePluginStudioDraft;
    if (!project.name) throw new PluginStudioFailure('validation', 'Plugin name is required');
    project.files = this.options.builder.createScaffold({
      id: project.pluginId,
      name: project.name,
      version: project.version,
      hosts: project.hosts,
      capabilities: project.capabilities,
      selectors: project.selectors,
      files: {}
    });
    return publicDraft(await this.options.drafts.create(project));
  }

  async list() {
    return Promise.all((await this.options.drafts.list()).map(publicDraft));
  }

  async get(id: string) {
    return publicDraft(await this.requireDraft(id));
  }

  async update(id: string, input: UpdatePluginStudioProjectInput) {
    const current = await this.requireDraft(id);
    const currentRevision = current.revision ?? 1;
    if (input.expectedRevision !== currentRevision) {
      throw new PluginStudioFailure('conflict', 'Plugin Studio revision is stale', {
        expectedRevision: input.expectedRevision,
        currentRevision
      });
    }
    const patch: Partial<SourcePluginStudioDraft> = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.pluginId !== undefined ? { pluginId: input.pluginId.trim() } : {}),
      ...(input.version !== undefined ? { version: input.version.trim() } : {}),
      ...(input.hosts !== undefined ? { hosts: normalizedHosts(input.hosts) } : {}),
      ...(input.capabilities !== undefined
        ? { capabilities: normalizedCapabilities(input.capabilities) }
        : {}),
      ...(input.selectors !== undefined ? { selectors: input.selectors } : {}),
      ...(input.files !== undefined ? { files: input.files } : {}),
      revision: currentRevision + 1,
      artifactChecksum: undefined,
      builtRevision: undefined,
      updatedAt: this.options.clock.now().toISOString()
    };
    if (patch.name === '') throw new PluginStudioFailure('validation', 'Plugin name is required');
    try {
      return publicDraft(await this.options.drafts.update(id, patch, currentRevision));
    } catch (error) {
      if (error instanceof Error && 'kind' in error && error.kind === 'conflict') throw error;
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.requireDraft(id);
    await this.options.drafts.remove(id);
  }

  async build(id: string) {
    const draft = await this.requireDraft(id);
    const compiled = await this.compile(draft);
    const revision = draft.revision ?? 1;
    await this.options.drafts.update(
      id,
      {
        artifactChecksum: compiled.checksum,
        builtRevision: revision,
        updatedAt: this.options.clock.now().toISOString()
      },
      revision
    );
    return {
      artifactName: compiled.artifactName,
      checksum: compiled.checksum,
      size: compiled.packageBytes.byteLength,
      revision,
      stale: false,
      manifest: compiled.manifest
    };
  }

  async install(id: string) {
    const draft = await this.requireDraft(id);
    const compiled = await this.compile(draft);
    return this.options.installer.install({
      bytes: compiled.packageBytes,
      originalName: compiled.artifactName
    });
  }

  async test(id: string) {
    const supervisor = this.options.testSupervisor;
    if (!supervisor) {
      throw new PluginStudioFailure('validation', 'Plugin Studio sandbox testing is unavailable');
    }
    const draft = await this.requireDraft(id);
    const compiled = await this.compile(draft);
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'source-plugin-studio-test-'));
    const checks = ['verified'];
    const request = async (
      operation: 'initialize' | 'healthCheck' | 'shutdown',
      payload: Record<string, unknown>
    ) => {
      const handle =
        supervisor.get(compiled.manifest.id, compiled.manifest.version) ??
        (await supervisor.start({
          pluginId: compiled.manifest.id,
          pluginVersion: compiled.manifest.version,
          packageRoot: runtimeRoot,
          entryPath: join(runtimeRoot, 'dist/index.js')
        }));
      return handle.request(
        {
          requestId: randomUUID(),
          operation,
          deadlineAt: new Date(Date.now() + 15_000).toISOString(),
          payload
        },
        new AbortController().signal
      );
    };

    try {
      for (const [path, content] of compiled.verified.files) {
        const target = join(runtimeRoot, ...path.split('/'));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
      }
      await request('initialize', {
        pluginId: compiled.manifest.id,
        pluginVersion: compiled.manifest.version,
        protocolVersion: 1,
        now: this.options.clock.now().toISOString()
      });
      checks.push('initialized');
      const health = (await request('healthCheck', {})) as { status?: unknown };
      if (health?.status !== 'healthy') {
        throw new PluginStudioFailure('validation', 'Plugin health check did not return healthy');
      }
      checks.push('healthy');
      await request('shutdown', { reason: 'application-stop' });
      checks.push('shutdown');
      return { status: 'healthy' as const, checks, revision: draft.revision ?? 1 };
    } finally {
      await supervisor.stop(
        compiled.manifest.id,
        compiled.manifest.version,
        'studio-test-complete'
      );
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  }

  async export(id: string) {
    const draft = await this.requireDraft(id);
    const compiled = await this.compile(draft);
    return { bytes: compiled.packageBytes, fileName: compiled.artifactName };
  }

  private async compile(draft: SourcePluginStudioDraft) {
    try {
      const compiled = await this.options.builder.build({
        id: draft.pluginId,
        name: draft.name,
        version: draft.version,
        hosts: draft.hosts,
        capabilities: draft.capabilities,
        selectors: draft.selectors,
        files: draft.files
      });
      const verified = await this.options.verifier.verify(compiled.packageBytes);
      return { ...compiled, verified };
    } catch (error) {
      throw new PluginStudioFailure(
        'validation',
        error instanceof Error ? error.message.slice(0, 1_000) : 'Plugin build failed'
      );
    }
  }

  private async requireDraft(id: string): Promise<SourcePluginStudioDraft> {
    const draft = await this.options.drafts.findById(id);
    if (!draft)
      throw new PluginStudioFailure('not_found', `Plugin Studio project ${id} was not found`);
    return draft;
  }
}
