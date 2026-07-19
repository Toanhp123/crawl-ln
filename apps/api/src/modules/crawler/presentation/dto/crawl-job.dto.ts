import { z } from 'zod';
import {
  AnalyzeNovelRequestSchema,
  CrawlNovelRequestSchema,
  IdParamsSchema
} from '@novel-tool/shared';

export const analyzeSourceDto = AnalyzeNovelRequestSchema;
export const createCrawlJobDto = CrawlNovelRequestSchema;
export const crawlJobParamsDto = IdParamsSchema;

export const listCrawlJobsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export const listCrawlEventsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});
