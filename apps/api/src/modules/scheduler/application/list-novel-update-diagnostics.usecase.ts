import type { SchedulerDiagnosticsRepository } from './ports/scheduler-diagnostics.repository.js';

export class ListNovelUpdateDiagnosticsUseCase {
  constructor(private readonly diagnostics: SchedulerDiagnosticsRepository) {}
  execute(novelId: string) {
    return this.diagnostics.listByNovel(novelId);
  }
}
