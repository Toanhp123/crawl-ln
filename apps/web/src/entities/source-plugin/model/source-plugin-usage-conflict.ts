import { getApiErrorDetails } from '../../../shared/api';

export type SourcePluginUsageConflictOperation = 'deny' | 'disable' | 'remove';

export interface SourcePluginUsageConflict {
  operation: SourcePluginUsageConflictOperation;
  pluginId: string;
  blockingJobCount: number;
  blockingJobs: Array<{ jobId: string; novelId: string; status: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getSourcePluginUsageConflict(error: unknown): SourcePluginUsageConflict | null {
  const details = getApiErrorDetails(error, { status: 409, code: 'CONFLICT' });
  if (!isRecord(details) || details.reason !== 'SOURCE_PLUGIN_IN_USE') return null;
  const operation = details.operation;
  const pluginId = details.pluginId;
  const blockingJobCount = details.blockingJobCount;
  const blockingJobs = details.blockingJobs;
  if (
    (operation !== 'deny' && operation !== 'disable' && operation !== 'remove') ||
    typeof pluginId !== 'string' ||
    typeof blockingJobCount !== 'number' ||
    !Array.isArray(blockingJobs)
  ) {
    return null;
  }

  const jobs = blockingJobs.flatMap((job) => {
    if (!isRecord(job)) return [];
    if (
      typeof job.jobId !== 'string' ||
      typeof job.novelId !== 'string' ||
      typeof job.status !== 'string'
    ) {
      return [];
    }
    return [{ jobId: job.jobId, novelId: job.novelId, status: job.status }];
  });
  if (jobs.length !== blockingJobs.length || blockingJobCount !== jobs.length) return null;
  return { operation, pluginId, blockingJobCount, blockingJobs: jobs };
}
