import type { LibraryQueries } from '../../../library/public/library.api.js';
import type { IngestionJobStatus } from '../../domain/ingestion.models.js';
import type { IngestionRepository } from '../../domain/repositories/ingestion.repository.js';

export type IngestionSourcePluginUsageOperation = 'deny' | 'disable' | 'remove';

export interface IngestionSourcePluginUsageRecord {
  jobId: string;
  novelId: string;
  status: IngestionJobStatus;
  sourceUrls: readonly string[];
  unresolved?: boolean;
}

const disableBlockingStatuses: readonly IngestionJobStatus[] = [
  'queued',
  'running',
  'pausing',
  'resuming'
];
const removeBlockingStatuses: readonly IngestionJobStatus[] = [
  'queued',
  'running',
  'pausing',
  'paused',
  'resuming'
];

export class IngestionSourcePluginUsageQueryService {
  constructor(
    private readonly repository: Pick<IngestionRepository, 'findAllByStatuses' | 'findJobChapters'>,
    private readonly library: Pick<LibraryQueries, 'getNovel'>
  ) {}

  async listPotentialUsages(
    operation: IngestionSourcePluginUsageOperation
  ): Promise<IngestionSourcePluginUsageRecord[]> {
    const statuses = operation === 'disable' ? disableBlockingStatuses : removeBlockingStatuses;
    const jobs = await this.repository.findAllByStatuses(statuses);
    return Promise.all(
      jobs.map(async (job) => {
        const [detail, planned] = await Promise.all([
          this.library.getNovel(job.novelId),
          this.repository.findJobChapters(job.id)
        ]);
        if (!detail) {
          return {
            jobId: job.id,
            novelId: job.novelId,
            status: job.status,
            sourceUrls: [],
            unresolved: true
          };
        }

        const plannedIds = new Set(planned.map((chapter) => chapter.chapterId));
        const plannedUrls = detail.chapters
          .filter((chapter) => plannedIds.has(chapter.id))
          .map((chapter) => chapter.sourceUrl);
        const fallbackUrls = [
          detail.novel.sourceUrl,
          ...detail.chapters.map((chapter) => chapter.sourceUrl)
        ];
        return {
          jobId: job.id,
          novelId: job.novelId,
          status: job.status,
          sourceUrls: [...new Set(plannedUrls.length > 0 ? plannedUrls : fallbackUrls)]
        };
      })
    );
  }
}
