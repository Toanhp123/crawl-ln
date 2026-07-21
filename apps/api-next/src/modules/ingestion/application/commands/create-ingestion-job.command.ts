import type { LibraryQueries } from '../../../library/public/library.api.js';
import { IngestionJobEntity } from '../../domain/entities/ingestion-job.entity.js';
import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionJob } from '../../domain/ingestion.models.js';
import type { IngestionRepository } from '../../domain/repositories/ingestion.repository.js';
import type { CreateIngestionJobCommand } from '../../public/ingestion.contracts.js';
import type { IngestionIdGeneratorPort } from '../ports/id-generator.port.js';

export interface IngestionQueueWriterPort {
  enqueue(jobId: string): Promise<void> | void;
}

export class CreateIngestionJobCommandHandler {
  constructor(
    private readonly library: LibraryQueries,
    private readonly repository: Pick<IngestionRepository, 'createForCommand'>,
    private readonly queue: IngestionQueueWriterPort,
    private readonly ids: IngestionIdGeneratorPort
  ) {}

  async execute(command: CreateIngestionJobCommand): Promise<IngestionJob> {
    const detail = await this.library.getNovel(command.novelId);
    if (!detail) {
      throw new IngestionError('INGESTION_NOT_FOUND', 'Library novel was not found', {
        novelId: command.novelId
      });
    }
    const pending = detail.chapters.filter(
      (chapter) => chapter.sourceAvailable && chapter.status !== 'fetched'
    );
    if (pending.length === 0) {
      throw new IngestionError('INGESTION_CONFLICT', 'Novel has no pending source chapters');
    }

    const job = IngestionJobEntity.createQueued({
      id: this.ids.randomId(),
      novelId: detail.novel.id,
      totalChapters: pending.length,
      now: command.requestedAt
    }).toPrimitives();
    const stored = await this.repository.createForCommand(
      command.commandId,
      job,
      pending.map((chapter) => chapter.id)
    );
    if (stored.created) await this.queue.enqueue(stored.job.id);
    return stored.job;
  }
}
