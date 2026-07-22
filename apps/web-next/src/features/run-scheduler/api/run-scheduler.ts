import type { SchedulerStatus } from '../../../entities/scheduler';
import { http } from '../../../shared/api';

export function runScheduler(): Promise<SchedulerStatus> {
  return http<SchedulerStatus>('/api/scheduler/tick', { method: 'POST' });
}
