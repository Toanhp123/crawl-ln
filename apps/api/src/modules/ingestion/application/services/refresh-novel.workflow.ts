import type { LibraryQueries } from '../../../library/public/library.api.js';
import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionJob } from '../../domain/ingestion.models.js';
import type {
  AnalyzeNovelCommand,
  CreateIngestionJobCommand,
  RefreshNovelCommand
} from '../../public/ingestion.contracts.js';

export class RefreshNovelWorkflow {
  constructor(
    private readonly library: LibraryQueries,
    private readonly analyze: { execute(command: AnalyzeNovelCommand): Promise<unknown> },
    private readonly createJob: {
      execute(command: CreateIngestionJobCommand): Promise<IngestionJob>;
    }
  ) {}

  async execute(command: RefreshNovelCommand): Promise<IngestionJob | null> {
    const current = await this.library.getNovel(command.novelId);
    if (!current) {
      throw new IngestionError('INGESTION_NOT_FOUND', 'Library novel was not found', {
        novelId: command.novelId
      });
    }
    await this.analyze.execute({
      commandId: `${command.commandId}:analysis`,
      url: current.novel.sourceUrl,
      requestedAt: command.requestedAt
    });
    try {
      return await this.createJob.execute({
        commandId: `${command.commandId}:job`,
        novelId: command.novelId,
        requestedAt: command.requestedAt
      });
    } catch (error) {
      if (
        error instanceof IngestionError &&
        error.code === 'INGESTION_CONFLICT' &&
        /no pending/i.test(error.message)
      ) {
        return null;
      }
      throw error;
    }
  }
}
