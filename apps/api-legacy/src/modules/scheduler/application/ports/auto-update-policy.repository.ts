import type {
  AutoUpdateInterval,
  Novel,
  NovelUpdateResultCode
} from '../models/scheduler-contracts.js';

export interface AutoUpdatePolicyRepository {
  updatePolicy(
    id: string,
    enabled: boolean,
    intervalMinutes: AutoUpdateInterval,
    nowIso: string,
    nextCheckAt?: string
  ): Promise<Novel | null>;
  listDue(nowIso: string, limit: number): Promise<Novel[]>;
  countMonitored(): Promise<number>;
  countDue(nowIso: string): Promise<number>;
  recordState(
    id: string,
    state: {
      lastCheckAt: string;
      nextCheckAt: string;
      result: NovelUpdateResultCode;
      consecutiveFailures: number;
    }
  ): Promise<void>;
}
