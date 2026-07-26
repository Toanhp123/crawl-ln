import type { SourcePluginManifest } from '../../../../domain/plugin/source-plugin.js';

export const novelCoolManifest: SourcePluginManifest = {
  id: 'novelcool',
  name: 'NovelCool',
  version: '1.0.1',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['identify', 'metadata', 'chapter-list', 'chapter-content'],
  contracts: {
    identify: 1,
    metadata: 1,
    'chapter-list': 1,
    'chapter-content': 1
  },
  matchers: [
    {
      hosts: ['novelcool.com'],
      include: ['/novel/**', '/chapter/**'],
      exclude: ['/account/**', '/login/**'],
      priority: 100
    }
  ],
  runtime: { preferredMode: 'in-process' },
  permissions: {
    network: { hosts: ['novelcool.com', '*.novelcool.com'] }
  }
};
