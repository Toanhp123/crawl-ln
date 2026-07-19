import type {
  AutoUpdateInterval,
  Novel,
  NovelUpdateDiagnostic,
  SchedulerStatus
} from '@novel-tool/shared';
import { http } from '@/shared/api/http';

export function updateAutoUpdatePolicy(
  novelId: string,
  enabled: boolean,
  intervalMinutes: AutoUpdateInterval
) {
  return http<Novel>(`/api/novels/${encodeURIComponent(novelId)}/auto-update`, {
    method: 'PUT',
    body: JSON.stringify({ enabled, intervalMinutes })
  });
}

export function getNovelUpdateDiagnostics(novelId: string, signal?: AbortSignal) {
  return http<NovelUpdateDiagnostic[]>(
    `/api/novels/${encodeURIComponent(novelId)}/update-diagnostics`,
    { signal }
  );
}

export function getSchedulerStatus(signal?: AbortSignal) {
  return http<SchedulerStatus>('/api/scheduler/status', { signal });
}

export function runSchedulerTick() {
  return http<SchedulerStatus>('/api/scheduler/tick', { method: 'POST' });
}
