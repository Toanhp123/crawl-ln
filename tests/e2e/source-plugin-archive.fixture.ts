import JSZip from 'jszip';

export interface SourcePluginArchiveFixture {
  buffer: Buffer;
  fileName: string;
  manifest: {
    id: string;
    name: string;
    version: string;
    capabilities: string[];
    permissions: { network: { hosts: string[] } };
  };
}

export async function createSourcePluginArchiveFixture({
  id = 'novelcool',
  name = 'NovelCool',
  version = '1.0.0',
  hosts = [`${id}.example`],
  capabilities = ['identify', 'metadata']
}: {
  id?: string;
  name?: string;
  version?: string;
  hosts?: string[];
  capabilities?: string[];
} = {}): Promise<SourcePluginArchiveFixture> {
  const manifest = {
    id,
    name,
    version,
    engines: { sourceReader: '^3.0.0' },
    capabilities,
    contracts: Object.fromEntries(capabilities.map((capability) => [capability, 1])),
    matchers: [{ hosts, include: ['/**'], priority: 100 }],
    runtime: { preferredMode: 'isolated' },
    permissions: { network: { hosts } }
  };
  const archive = new JSZip();
  archive.file('manifest.json', JSON.stringify(manifest, null, 2));
  archive.file('src/index.ts', 'export default {}');
  archive.file('README.md', '# Ignored by Studio import');
  return {
    buffer: await archive.generateAsync({
      type: 'nodebuffer',
      platform: 'UNIX',
      compression: 'DEFLATE'
    }),
    fileName: `${id}-source.zip`,
    manifest
  };
}
