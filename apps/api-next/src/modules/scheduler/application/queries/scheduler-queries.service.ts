import type { SchedulerRepository } from '../ports/scheduler.repository.js';

export class SchedulerQueriesService {
  constructor(private readonly repository: SchedulerRepository) {}

  getPolicy(novelId: string) {
    return this.repository.findPolicy(novelId);
  }

  getPolicies(novelIds: string[]) {
    return this.repository.findPolicies(novelIds);
  }

  listDiagnostics(novelId: string) {
    return this.repository.listDiagnostics(novelId);
  }
}
