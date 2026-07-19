import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSourcePluginManifest } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts';
import { assertPluginContract } from '../helpers/source-reader-plugin-contract.ts';

test('manifest accepts independent capability contracts and matchers', () => {
  const manifest = parseSourcePluginManifest({
    id: 'demo-reader',
    name: 'Demo Reader',
    version: '1.0.0',
    engines: { sourceReader: '>=1.0.0 <2.0.0' },
    capabilities: ['metadata'],
    contracts: { metadata: 1 },
    matchers: [{ hosts: ['example.test'], capabilities: ['metadata'], priority: 100 }],
    runtime: { preferredMode: 'in-process' },
    permissions: { network: { hosts: ['example.test'] } }
  });
  assert.deepEqual(manifest.capabilities, ['metadata']);
});

test('declared capability requires its method but undeclared methods do not', () => {
  assert.throws(
    () =>
      assertPluginContract({
        manifest: parseSourcePluginManifest({
          id: 'broken',
          name: 'Broken',
          version: '1.0.0',
          engines: { sourceReader: '>=1.0.0 <2.0.0' },
          capabilities: ['chapter-content'],
          contracts: { 'chapter-content': 1 },
          matchers: [{ hosts: ['example.test'], priority: 1 }],
          runtime: { preferredMode: 'in-process' },
          permissions: { network: { hosts: ['example.test'] } }
        })
      }),
    /readChapterContent/
  );
});
