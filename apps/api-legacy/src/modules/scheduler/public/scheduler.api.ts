import type { AutoUpdateInterval, Novel } from '../application/models/scheduler-contracts.js';

export interface UpdateAutoUpdatePolicyApi {
  execute(id: string, enabled: boolean, intervalMinutes: AutoUpdateInterval): Promise<Novel>;
}

export interface SchedulerApi {
  readonly updateAutoUpdatePolicy: UpdateAutoUpdatePolicyApi;
}

export interface SchedulerLifecycle {
  readonly service: {
    start(): void;
    stop(): Promise<void>;
  };
}
