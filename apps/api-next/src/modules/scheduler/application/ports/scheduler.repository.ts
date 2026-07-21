import type {
  AutoUpdateInterval,
  SchedulerDiagnostic,
  SchedulerPolicy,
  SchedulerResultCode
} from '../../domain/scheduler.models.js';

export interface SchedulerRepository {
  upsertPolicy(input: {
    novelId: string;
    enabled: boolean;
    intervalMinutes: AutoUpdateInterval;
    nextCheckAt?: string;
    now: string;
  }): Promise<SchedulerPolicy>;
  findPolicy(novelId: string): Promise<SchedulerPolicy | null>;
  listDue(now: string, limit: number): Promise<SchedulerPolicy[]>;
  countMonitored(): Promise<number>;
  countDue(now: string): Promise<number>;
  recordState(
    novelId: string,
    state: {
      lastCheckAt: string;
      nextCheckAt: string;
      result: SchedulerResultCode;
      consecutiveFailures: number;
      updatedAt: string;
    }
  ): Promise<void>;
  addDiagnostic(diagnostic: SchedulerDiagnostic): Promise<void>;
  listDiagnostics(novelId: string, limit?: number): Promise<SchedulerDiagnostic[]>;
  pruneDiagnostics(novelId: string, keep: number): Promise<void>;
}
