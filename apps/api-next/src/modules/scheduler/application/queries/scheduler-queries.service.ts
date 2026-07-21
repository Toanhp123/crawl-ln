import type { SchedulerRepository } from '../ports/scheduler.repository.js';

export class SchedulerQueriesService {
  constructor(private readonly repository: SchedulerRepository) {}

  listDiagnostics(novelId: string) {
    return this.repository.listDiagnostics(novelId);
  }
}
