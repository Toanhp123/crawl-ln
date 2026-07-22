import type {
  SchedulerCommands,
  SchedulerLifecycleApi,
  SchedulerQueries
} from './scheduler.contracts.js';

export interface SchedulerApi {
  commands: SchedulerCommands;
  queries: SchedulerQueries;
  lifecycle: SchedulerLifecycleApi;
}

export type {
  SchedulerCommands,
  SchedulerLifecycleApi,
  SchedulerQueries,
  UpdateSchedulerPolicyCommand
} from './scheduler.contracts.js';
export type {
  AutoUpdateInterval,
  ScheduledNovel,
  SchedulerDiagnostic,
  SchedulerPolicy,
  SchedulerResultCode,
  SchedulerStatus
} from '../domain/scheduler.models.js';
