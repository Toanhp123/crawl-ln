import { z } from 'zod';
import type { SourceProfile } from './source-profile.js';

const selectorValueSchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

const selectorsSchema = z.object({
  title: selectorValueSchema,
  author: selectorValueSchema.optional(),
  cover: selectorValueSchema.optional(),
  description: selectorValueSchema.optional(),
  chapterLinks: selectorValueSchema,
  chapterTitle: selectorValueSchema.optional(),
  chapterContent: selectorValueSchema,
  remove: z.array(z.string().min(1)).optional()
});

export const sourceProfileSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  hosts: z.array(z.string().min(1)).min(1),
  enabled: z.boolean().optional(),
  selectors: selectorsSchema,
  chapterListOrder: z.enum(['oldest-first', 'newest-first']).optional(),
  http: z
    .object({
      userAgent: z.string().min(1).optional(),
      headers: z.record(z.string()).optional(),
      timeoutMs: z.number().int().positive().optional()
    })
    .optional(),
  crawlPolicy: z
    .object({
      respectRobotsTxt: z.boolean().optional(),
      crawlDelayMs: z.number().int().nonnegative().optional(),
      maxChaptersPerRun: z.number().int().positive().optional()
    })
    .optional()
}) satisfies z.ZodType<SourceProfile>;

export const sourceProfilesFileSchema = z.array(sourceProfileSchema);

export function parseSourceProfiles(value: unknown): SourceProfile[] {
  return sourceProfilesFileSchema.parse(value);
}
