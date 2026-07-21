import type {
  AutoUpdateInterval,
  ScheduledNovel,
  SchedulerDiagnostic,
  SchedulerPolicy,
  SchedulerStatus
} from '../domain/scheduler.models.js';

export interface UpdateSchedulerPolicyCommand {
  novelId: string;
  enabled: boolean;
  intervalMinutes: AutoUpdateInterval;
}

export interface SchedulerCommands {
  updatePolicy(command: UpdateSchedulerPolicyCommand): Promise<ScheduledNovel>;
}

export interface SchedulerQueries {
  status(): Promise<SchedulerStatus>;
  getPolicy(novelId: string): Promise<SchedulerPolicy | null>;
  getPolicies(novelIds: string[]): Promise<SchedulerPolicy[]>;
  listDiagnostics(novelId: string): Promise<SchedulerDiagnostic[]>;
}

export interface SchedulerLifecycleApi {
  tick(): Promise<void>;
}
