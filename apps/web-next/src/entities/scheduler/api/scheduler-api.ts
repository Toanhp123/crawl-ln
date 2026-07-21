import type {
  NovelUpdateDiagnostic as NovelUpdateDiagnosticTransport,
  SchedulerStatus as SchedulerStatusTransport
} from '@novel-tool/shared';
import { http } from '../../../shared/api';

export type NovelUpdateDiagnostic = NovelUpdateDiagnosticTransport;
export type SchedulerStatus = SchedulerStatusTransport;

export function getSchedulerStatus(signal?: AbortSignal) {
  return http<SchedulerStatus>('/api/scheduler/status', { signal });
}

export function getNovelUpdateDiagnostics(novelId: string, signal?: AbortSignal) {
  return http<NovelUpdateDiagnostic[]>(
    `/api/novels/${encodeURIComponent(novelId)}/update-diagnostics`,
    { signal }
  );
}
