import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionJob } from '../../domain/ingestion.models.js';
import type { IngestionQueries, JobIdentityCommand } from '../../public/ingestion.contracts.js';

export interface ResumePausedJobsCommand {
  commandId: string;
  limit: number;
  requestedAt: string;
}

export class ResumePausedJobsService {
  constructor(
    private readonly queries: Pick<IngestionQueries, 'listJobs' | 'getJob'>,
    private readonly resume: { execute(command: JobIdentityCommand): Promise<void> }
  ) {}

  async execute(command: ResumePausedJobsCommand): Promise<IngestionJob[]> {
    const paused = await this.queries.listJobs({ limit: command.limit, status: 'paused' });
    const resumed: IngestionJob[] = [];
    for (const job of paused) {
      await this.resume.execute({
        commandId: `${command.commandId}:${job.id}`,
        jobId: job.id,
        requestedAt: command.requestedAt
      });
      const current = await this.queries.getJob(job.id);
      if (!current) {
        throw new IngestionError('INGESTION_NOT_FOUND', 'Crawl job not found', {
          jobId: job.id
        });
      }
      resumed.push(current);
    }
    return resumed;
  }
}
