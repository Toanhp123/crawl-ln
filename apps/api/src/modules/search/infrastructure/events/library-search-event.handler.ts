import { z } from 'zod';
import {
  LIBRARY_ANALYSIS_RECONCILED,
  LIBRARY_CHAPTER_CONTENT_SAVED,
  LIBRARY_NOVEL_DELETED
} from '../../../library/public/library.api.js';
import type { ApplicationEvent } from '../../../../platform/events/application-event.js';
import type { LibrarySearchProjectionService } from '../../application/services/library-search-projection.service.js';

const novelSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sourceName: z.string().min(1)
});

const chapterSchema = z.object({
  id: z.string().min(1),
  novelId: z.string().min(1),
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  rawText: z.string().optional(),
  cleanText: z.string().optional(),
  status: z.enum(['pending', 'fetched', 'failed']),
  sourceAvailable: z.boolean()
});

const analysisPayloadSchema = z.object({
  commandId: z.string().min(1),
  novel: novelSchema,
  chapters: z.array(chapterSchema)
});

const chapterPayloadSchema = z.object({
  commandId: z.string().min(1),
  novelTitle: z.string().min(1),
  chapter: chapterSchema
});

const deletionPayloadSchema = z.object({
  commandId: z.string().min(1),
  novelId: z.string().min(1)
});

export class LibrarySearchEventHandler {
  constructor(
    private readonly projection: LibrarySearchProjectionService,
    private readonly clock: { now(): Date }
  ) {}

  async handle(event: ApplicationEvent): Promise<void> {
    const projectionEvent = {
      id: event.id,
      type: event.type,
      projectedAt: this.clock.now().toISOString()
    };
    switch (event.type) {
      case LIBRARY_ANALYSIS_RECONCILED:
        await this.projection.projectAnalysis(
          projectionEvent,
          analysisPayloadSchema.parse(event.payload)
        );
        return;
      case LIBRARY_CHAPTER_CONTENT_SAVED:
        await this.projection.projectChapter(
          projectionEvent,
          chapterPayloadSchema.parse(event.payload)
        );
        return;
      case LIBRARY_NOVEL_DELETED:
        await this.projection.projectDeletion(
          projectionEvent,
          deletionPayloadSchema.parse(event.payload)
        );
    }
  }
}
