export const SOURCE_DATA_CAPABILITIES = [
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content',
  'search',
  'latest-updates'
] as const;

export type SourceDataCapability = (typeof SOURCE_DATA_CAPABILITIES)[number];

export const SOURCE_CAPABILITIES = [...SOURCE_DATA_CAPABILITIES, 'authentication'] as const;

export type SourceCapability = (typeof SOURCE_CAPABILITIES)[number];

export const SOURCE_CAPABILITY_METHODS = {
  identify: 'identify',
  metadata: 'readMetadata',
  'chapter-list': 'readChapterList',
  'chapter-content': 'readChapterContent',
  search: 'search',
  'latest-updates': 'latestUpdates'
} as const satisfies Record<SourceDataCapability, string>;
