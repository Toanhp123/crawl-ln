import type { IngestionRepository } from '../../domain/repositories/ingestion.repository.js';
import type { ListIngestionJobsQuery, IngestionQueries } from '../../public/ingestion.contracts.js';

export class IngestionQueriesService implements IngestionQueries {
  constructor(private readonly repository: IngestionRepository) {}

  listJobs(query: ListIngestionJobsQuery) {
    return this.repository.findAll(query.limit, query.status);
  }

  getJob(id: string) {
    return this.repository.findById(id);
  }

  getJobEvents(id: string) {
    return this.repository.findEvents(id);
  }

  getNovelJob(novelId: string) {
    return this.repository.findByNovelId(novelId);
  }

  async getSummary() {
    return { activeCount: await this.repository.countActive() };
  }
}
