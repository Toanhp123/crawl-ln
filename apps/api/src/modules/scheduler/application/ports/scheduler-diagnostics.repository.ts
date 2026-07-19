import type { NovelUpdateDiagnostic } from '../models/scheduler-contracts.js';

export interface SchedulerDiagnosticsRepository {
  add(entry: NovelUpdateDiagnostic): Promise<void>;
  listByNovel(novelId: string, limit?: number): Promise<NovelUpdateDiagnostic[]>;
  pruneByNovel(novelId: string, keep: number): Promise<void>;
}
