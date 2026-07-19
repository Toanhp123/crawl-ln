import assert from 'node:assert/strict';
import type { SourceReaderPlugin } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';

const methodByCapability = {
  identify: 'identify',
  metadata: 'readMetadata',
  'chapter-list': 'readChapterList',
  'chapter-content': 'readChapterContent',
  search: 'search',
  'latest-updates': 'latestUpdates',
  authentication: 'authentication'
} as const;

export function assertPluginContract(plugin: SourceReaderPlugin): void {
  for (const capability of plugin.manifest.capabilities) {
    const method = methodByCapability[capability];
    if (capability === 'authentication') continue;
    assert.equal(
      typeof plugin[method],
      'function',
      `${plugin.manifest.id} declares ${capability} but does not implement ${method}`
    );
  }
}
