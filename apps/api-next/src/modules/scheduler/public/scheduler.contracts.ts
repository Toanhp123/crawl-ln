import type {
  AutoUpdateInterval,
  ScheduledNovel,
  SchedulerDiagnostic,
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
  listDiagnostics(novelId: string): Promise<SchedulerDiagnostic[]>;
}

export interface SchedulerLifecycleApi {
  tick(): Promise<void>;
}
