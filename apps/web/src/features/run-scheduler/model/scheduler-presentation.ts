import type { SchedulerStatus } from '../../../entities/scheduler';

export type SchedulerDisplayState = {
  key: 'running' | 'enabled' | 'disabled';
  tone: 'info' | 'success' | 'neutral';
};

export function getSchedulerDisplayState(
  status: Pick<SchedulerStatus, 'running' | 'activeRuns'>
): SchedulerDisplayState {
  if (status.activeRuns > 0) return { key: 'running', tone: 'info' };
  return status.running
    ? { key: 'enabled', tone: 'success' }
    : { key: 'disabled', tone: 'neutral' };
}
