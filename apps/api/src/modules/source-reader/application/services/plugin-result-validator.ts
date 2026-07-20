import { z } from 'zod';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { SourceCapability } from '../../public/source-reader.models.js';

const schemas = {
  identify: z.object({
    normalizedUrl: z.string().url(),
    domain: z.string().min(1),
    pageType: z.enum(['novel', 'chapter', 'search', 'latest', 'unknown'])
  }),
  metadata: z.object({
    title: z.string().min(2),
    sourceUrl: z.string().url(),
    sourceName: z.string().min(1),
    author: z.string().optional(),
    coverUrl: z.string().url().optional(),
    description: z.string().optional(),
    status: z.enum(['ongoing', 'completed', 'hiatus', 'cancelled', 'unknown']).optional()
  }),
  'chapter-list': z.object({
    items: z.array(
      z.object({
        index: z.number().int().positive(),
        title: z.string().min(1),
        url: z.string().url(),
        publishedAt: z.string().optional()
      })
    ),
    nextCursor: z.string().optional(),
    hasMore: z.boolean()
  }),
  'chapter-content': z.object({
    title: z.string().min(1),
    url: z.string().url(),
    rawText: z.string(),
    cleanText: z.string().min(1)
  }),
  search: z.object({
    items: z.array(
      z.object({
        title: z.string().min(1),
        url: z.string().url(),
        author: z.string().optional(),
        coverUrl: z.string().url().optional()
      })
    ),
    nextCursor: z.string().optional(),
    hasMore: z.boolean()
  }),
  'latest-updates': z.object({
    items: z.array(
      z.object({
        novelTitle: z.string().min(1),
        novelUrl: z.string().url(),
        chapterTitle: z.string().optional(),
        chapterUrl: z.string().url().optional(),
        updatedAt: z.string().optional()
      })
    ),
    nextCursor: z.string().optional(),
    hasMore: z.boolean()
  })
} as const;

export function validatePluginResult(
  capability: Exclude<SourceCapability, 'authentication'>,
  value: unknown
): unknown {
  const result = schemas[capability].safeParse(value);
  if (!result.success) {
    throw new SourceReaderError(
      'PLUGIN_RESULT_INVALID',
      'Plugin returned invalid normalized data',
      {
        retryable: false,
        fallbackAllowed: true,
        details: { capability, issues: result.error.issues }
      }
    );
  }
  return result.data;
}
