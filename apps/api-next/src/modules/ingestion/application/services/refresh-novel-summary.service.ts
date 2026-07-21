import type { LibraryQueries } from '../../../library/public/library.api.js';
import type { LibraryNovelDetail } from '../../../library/public/library.api.js';
import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionJob } from '../../domain/ingestion.models.js';
import type { RefreshNovelCommand } from '../../public/ingestion.contracts.js';
import type { RefreshNovelWorkflow } from './refresh-novel.workflow.js';

export interface RefreshNovelSummaryResult {
  novel: LibraryNovelDetail;
  newChapterCount: number;
  pendingChapterCount: number;
  task: IngestionJob | null;
}

export class RefreshNovelSummaryService {
  constructor(
    private readonly library: Pick<LibraryQueries, 'getNovel'>,
    private readonly refresh: Pick<RefreshNovelWorkflow, 'execute'>
  ) {}

  async execute(command: RefreshNovelCommand): Promise<RefreshNovelSummaryResult> {
    const before = await this.library.getNovel(command.novelId);
    if (!before) {
      throw new IngestionError('INGESTION_NOT_FOUND', 'Library novel was not found', {
        novelId: command.novelId
      });
    }
    const previousUrls = new Set(before.chapters.map((chapter) => chapter.sourceUrl));
    const task = await this.refresh.execute(command);
    const novel = await this.library.getNovel(command.novelId);
    if (!novel) {
      throw new IngestionError('INGESTION_NOT_FOUND', 'Library novel was not found after refresh', {
        novelId: command.novelId
      });
    }
    return {
      novel,
      newChapterCount: novel.chapters.filter((chapter) => !previousUrls.has(chapter.sourceUrl))
        .length,
      pendingChapterCount:
        task?.totalChapters ??
        novel.chapters.filter((chapter) => chapter.sourceAvailable && chapter.status !== 'fetched')
          .length,
      task
    };
  }
}
