import type { SourceDataCapability, SourcePluginManifest } from '@novel-tool/source-plugin-sdk';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import JSZip from 'jszip';
import { parseSourcePluginManifest } from '../../../domain/plugin/source-plugin-manifest.schema.js';
import type { SourcePluginStudioSelectors } from '../../../application/ports/plugin-studio-draft.repository.js';
import type {
  PluginStudioBuilderPort,
  SourcePluginStudioBuildInput
} from '../../../application/ports/plugin-studio-builder.port.js';

const FIXED_ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');
const MAX_SOURCE_FILES = 50;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const BARE_IMPORT = /(?:from\s+|import\()\s*['"](?![./])/;
const GENERATED_CAPABILITIES = new Set<SourceDataCapability>([
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content'
]);

interface BuilderOptions {
  outputDirectory: string;
  sdkVersion: string;
  repositoryRoot?: string;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function safePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').some((segment) => segment === '' || segment === '..') &&
    /^(manifest\.json|src\/[A-Za-z0-9._/-]+|tests\/[A-Za-z0-9._/-]+)$/.test(path)
  );
}

function within(parent: string, candidate: string): boolean {
  const value = relative(parent, candidate);
  return (
    value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !value.startsWith(sep))
  );
}

function manifestFor(input: SourcePluginStudioBuildInput): SourcePluginManifest {
  const capabilities = [...new Set(input.capabilities)];
  if (capabilities.some((capability) => !GENERATED_CAPABILITIES.has(capability))) {
    throw new Error('Plugin Studio scaffold only supports core reader capabilities');
  }
  return parseSourcePluginManifest({
    id: input.id,
    name: input.name,
    version: input.version,
    description: `Source plugin created with Novel Tool Plugin Studio`,
    engines: { sourceReader: '^3.0.0' },
    capabilities,
    contracts: Object.fromEntries(capabilities.map((capability) => [capability, 1])),
    matchers: [{ hosts: input.hosts, include: ['/**'], priority: 100 }],
    runtime: { preferredMode: 'isolated' },
    permissions: { network: { hosts: input.hosts } }
  });
}

function methodSource(capability: SourceDataCapability): string {
  switch (capability) {
    case 'identify':
      return `async identify(request, context) {
      const normalizedUrl = await context.url.normalize(request.url);
      const parsed = new URL(normalizedUrl);
      return { data: { normalizedUrl, domain: parsed.hostname, pageType: 'unknown' } };
    }`;
    case 'metadata':
      return `async readMetadata(request, context) {
      const response = await context.http.get(request.url);
      const document = context.html.load(response.data);
      const title = (await document.text(selectors.title || 'title')).trim();
      if (!title) throw new SourcePluginError('PLUGIN_RESULT_INVALID', 'Novel title was not found');
      const cover = selectors.cover ? await document.attr(selectors.cover, 'src') : undefined;
      return { data: {
        title,
        sourceUrl: await context.url.normalize(response.url || request.url),
        sourceName: pluginName,
        author: selectors.author ? (await document.text(selectors.author)).trim() || undefined : undefined,
        coverUrl: cover ? await context.url.resolve(cover, response.url || request.url) : undefined,
        description: selectors.description ? (await document.text(selectors.description)).trim() || undefined : undefined
      } };
    }`;
    case 'chapter-list':
      return `async readChapterList(request, context) {
      if (request.cursor) throw new SourcePluginError('CURSOR_INVALID', 'This scaffold does not use cursors');
      const response = await context.http.get(request.url);
      const document = context.html.load(response.data);
      const nodes = await document.all(selectors.chapterList || 'a[href]');
      const items = [];
      for (const node of nodes.slice(0, request.limit)) {
        const href = await node.attr('href');
        if (!href) continue;
        items.push({ index: items.length + 1, title: (await node.text()).trim() || 'Chapter', url: await context.url.resolve(href, response.url || request.url) });
      }
      return { data: { items, hasMore: false } };
    }`;
    case 'chapter-content':
      return `async readChapterContent(request, context) {
      const response = await context.http.get(request.url);
      const document = context.html.load(response.data);
      const cleanText = (await document.text(selectors.chapterContent || 'article')).trim();
      if (!cleanText) throw new SourcePluginError('PLUGIN_RESULT_INVALID', 'Chapter content was not found');
      return { data: { title: (await document.text('h1')).trim() || 'Chapter', url: await context.url.normalize(response.url || request.url), rawText: cleanText, cleanText } };
    }`;
    case 'search':
    case 'latest-updates':
      throw new Error(`Plugin Studio cannot scaffold ${capability}`);
  }
}

function scaffold(input: SourcePluginStudioBuildInput, sdkVersion: string): Record<string, string> {
  const manifest = manifestFor(input);
  return {
    'manifest.json': json({ ...manifest, engines: { sourceReader: sdkVersion } }),
    'src/index.ts': `import { defineSourcePlugin, SourcePluginError } from '@novel-tool/source-plugin-sdk';

const pluginName = ${JSON.stringify(input.name)};
const hosts = ${JSON.stringify(input.hosts)};
const selectors = ${JSON.stringify(input.selectors, null, 2)};

export default defineSourcePlugin({
  async initialize() {},
  async healthCheck() { return { status: 'healthy' }; },
  async shutdown() {},
  async probeCanHandle(request) { return hosts.some((host) => request.domain === host || request.domain.endsWith(\`.\${host}\`)); },
  ${input.capabilities.map(methodSource).join(',\n  ')}
});
`,
    'tests/smoke.test.ts': `// Add parser fixtures here as the source integration grows.\n`
  };
}

export class SourcePluginStudioBuilder implements PluginStudioBuilderPort {
  private readonly outputDirectory: string;

  constructor(private readonly options: BuilderOptions) {
    this.outputDirectory = resolve(options.outputDirectory);
  }

  createScaffold(input: SourcePluginStudioBuildInput): Record<string, string> {
    return scaffold(input, this.options.sdkVersion);
  }

  async build(input: SourcePluginStudioBuildInput) {
    const files = Object.keys(input.files).length ? { ...input.files } : this.createScaffold(input);
    this.assertFiles(files);
    const manifest = parseSourcePluginManifest(JSON.parse(files['manifest.json']!));
    if (
      manifest.capabilities.some(
        (capability) => capability !== 'authentication' && !GENERATED_CAPABILITIES.has(capability)
      )
    ) {
      throw new Error('Plugin Studio only builds core reader capabilities');
    }
    const stagingRoot = join(this.outputDirectory, `.studio-build-${randomUUID()}`);
    const sourceRoot = join(stagingRoot, 'workspace');

    await mkdir(sourceRoot, { recursive: true });
    try {
      for (const [path, content] of Object.entries(files)) {
        if (path === 'manifest.json') continue;
        const target = resolve(sourceRoot, ...path.split('/'));
        if (!within(sourceRoot, target)) throw new Error(`Unsafe plugin source path: ${path}`);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, 'utf8');
      }
      const sdkEntry = fileURLToPath(import.meta.resolve('@novel-tool/source-plugin-sdk'));
      const sdkRoot = dirname(sdkEntry);
      const entryPath = resolve(sourceRoot, 'src/index.ts');
      const compiled = await build({
        entryPoints: [entryPath],
        outfile: 'index.js',
        bundle: true,
        write: false,
        metafile: true,
        platform: 'node',
        format: 'esm',
        target: 'node22',
        minify: true,
        sourcemap: false,
        legalComments: 'none',
        logLevel: 'silent',
        plugins: [
          {
            name: 'plugin-studio-import-policy',
            setup(buildContext) {
              buildContext.onResolve({ filter: /.*/ }, (args) => {
                if (args.kind === 'entry-point') return undefined;
                if (args.path === '@novel-tool/source-plugin-sdk') {
                  return { path: sdkEntry };
                }
                if (args.path.startsWith('.') && within(sourceRoot, args.importer)) {
                  const target = resolve(dirname(args.importer), args.path);
                  return within(sourceRoot, target)
                    ? undefined
                    : { errors: [{ text: `Import resolves outside the draft: ${args.path}` }] };
                }
                if (args.path.startsWith('.') && within(sdkRoot, args.importer)) {
                  const target = resolve(dirname(args.importer), args.path);
                  return within(sdkRoot, target)
                    ? undefined
                    : { errors: [{ text: `SDK import resolves outside the SDK: ${args.path}` }] };
                }
                return {
                  errors: [{ text: `Import is not allowed in Plugin Studio: ${args.path}` }]
                };
              });
            }
          }
        ]
      });
      if (
        compiled.outputFiles.length !== 1 ||
        !compiled.outputFiles[0]?.path.endsWith('index.js')
      ) {
        throw new Error('Plugin Studio compilation must emit exactly one JavaScript file');
      }
      const output = Object.values(compiled.metafile.outputs)[0];
      if (!output || output.imports.length > 0) {
        throw new Error('Plugin Studio bundle must not retain runtime imports');
      }
      const entry = compiled.outputFiles[0].contents;
      if (BARE_IMPORT.test(Buffer.from(entry).toString('utf8'))) {
        throw new Error('Plugin Studio bundle contains a bare module import');
      }
      const packageFiles = new Map<string, Uint8Array>([
        ['dist/index.js', entry],
        ['manifest.json', Buffer.from(json(manifest))]
      ]);
      const checksums = Object.fromEntries(
        [...packageFiles.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([path, content]) => [path, sha256(content)])
      );
      packageFiles.set('checksums.json', Buffer.from(json(checksums)));
      const zip = new JSZip();
      for (const [path, content] of [...packageFiles.entries()].sort(([a], [b]) =>
        a.localeCompare(b)
      )) {
        zip.file(path, content, {
          date: FIXED_ZIP_DATE,
          unixPermissions: 0o100644,
          createFolders: false
        });
      }
      const packageBytes = await zip.generateAsync({
        type: 'uint8array',
        platform: 'UNIX',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });
      const artifactName = `${manifest.id}-${manifest.version}.source-plugin`;
      return {
        manifest,
        files: Object.fromEntries(
          [...packageFiles.entries()].map(([path, content]) => [
            path,
            Buffer.from(content).toString('utf8')
          ])
        ),
        packageBytes,
        artifactName,
        checksum: sha256(packageBytes)
      };
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }

  private assertFiles(files: Record<string, string>): void {
    const entries = Object.entries(files);
    if (entries.length === 0 || entries.length > MAX_SOURCE_FILES) {
      throw new Error('Plugin Studio source file limit exceeded');
    }
    let bytes = 0;
    for (const [path, content] of entries) {
      if (!safePath(path)) throw new Error(`Unsafe plugin source path: ${path}`);
      bytes += Buffer.byteLength(content);
    }
    if (bytes > MAX_SOURCE_BYTES) throw new Error('Plugin Studio source size limit exceeded');
    if (!files['manifest.json']) throw new Error('Plugin Studio requires manifest.json');
    if (!files['src/index.ts']) throw new Error('Plugin Studio requires src/index.ts');
  }
}
