import { z } from 'zod';

export const sourceUrlRequestSchema = z.object({
  url: z.string().url(),
  credentialProfileId: z.string().min(1).optional(),
  networkProfileId: z.string().min(1).optional(),
  freshOnly: z.boolean().optional()
});

export const chapterListRequestSchema = sourceUrlRequestSchema.extend({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(500).optional()
});
