import { z } from 'zod';
export const searchQueryDto = z.object({
  q: z.string().trim().min(1).max(200),
  type: z.enum(['all', 'novel', 'chapter']).default('all'),
  novelId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});
