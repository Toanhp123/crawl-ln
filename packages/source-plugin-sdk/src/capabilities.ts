export const SOURCE_CAPABILITIES = [
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content',
  'search',
  'latest-updates',
  'authentication'
] as const;

export type SourceCapability = (typeof SOURCE_CAPABILITIES)[number];

export const SOURCE_CAPABILITY_METHODS = {
  identify: 'identify',
  metadata: 'readMetadata',
  'chapter-list': 'readChapterList',
  'chapter-content': 'readChapterContent',
  search: 'search',
  'latest-updates': 'latestUpdates',
  authentication: 'authenticate'
} as const satisfies Record<SourceCapability, string>;
