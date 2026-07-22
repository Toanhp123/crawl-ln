import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPluginRegistry } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import type { SourceReaderPlugin } from '../../apps/api-legacy/src/modules/source-reader/domain/plugin/source-plugin.ts';

const plugin = (
  id: string,
  priority: number,
  capability: 'metadata' | 'chapter-content',
  include?: string[]
): SourceReaderPlugin => ({
  manifest: {
    id,
    name: id,
    version: '1.0.0',
    engines: { sourceReader: '>=1.0.0 <2.0.0' },
    capabilities: [capability],
    contracts: { [capability]: 1 },
    matchers: [
      {
        hosts: ['example.test'],
        include,
        exclude: ['/account/**'],
        capabilities: [capability],
        priority
      }
    ],
    runtime: { preferredMode: 'in-process' },
    permissions: { network: { hosts: ['example.test'] } }
  },
  ...(capability === 'metadata'
    ? {
        readMetadata: async () => ({
          data: { title: id, sourceUrl: '', sourceName: id }
        })
      }
    : {
        readChapterContent: async () => ({
          data: { title: id, url: '', rawText: 'raw', cleanText: 'clean' }
        })
      })
});

test('registry composes one domain by capability and priority', async () => {
  const registry = new InMemoryPluginRegistry();
  registry.register(plugin('low', 10, 'metadata'));
  registry.register(plugin('high', 100, 'metadata', ['/novel/**']));
  registry.register(plugin('content', 50, 'chapter-content', ['/chapter/**']));

  const metadata = await registry.listCandidates({
    url: 'https://www.example.test/novel/book',
    capability: 'metadata'
  });
  assert.deepEqual(
    metadata.map((candidate) => candidate.plugin.manifest.id),
    ['high', 'low']
  );

  const content = await registry.listCandidates({
    url: 'https://example.test/chapter/1',
    capability: 'chapter-content'
  });
  assert.deepEqual(
    content.map((candidate) => candidate.plugin.manifest.id),
    ['content']
  );

  const excluded = await registry.listCandidates({
    url: 'https://example.test/account/profile',
    capability: 'metadata'
  });
  assert.deepEqual(excluded, []);
});

test('registry normalizes hosts, supports wildcards, and rejects duplicate ids', async () => {
  const wildcard = plugin('wildcard', 20, 'metadata');
  wildcard.manifest.matchers[0]!.hosts = ['*.example.test'];
  const registry = new InMemoryPluginRegistry();
  registry.register(wildcard);
  assert.equal(
    (
      await registry.listCandidates({
        url: 'https://www.blog.example.test/book',
        capability: 'metadata'
      })
    ).length,
    1
  );
  assert.throws(() => registry.register(wildcard), /Duplicate source plugin id/);
});
