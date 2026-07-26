import { useQuery, type QueryClient } from '@tanstack/react-query';
import { invalidateQuery, type QueryInvalidationOptions } from '../../../shared/api';
import type { BackupCurrentOperationResult, BackupOperationSummary } from '@novel-tool/shared';
import type { ConnectionState } from '../../../shared/realtime';
import { getBackupOperation, getCurrentBackupOperation } from './backup-operation-api';
import { backupOperationKeys } from './backup-operation-keys';

export function backupFallbackInterval(
  connectionState: ConnectionState | undefined,
  operation: BackupOperationSummary | null | undefined,
  enabled: boolean
): number | false {
  if (!enabled || connectionState === 'connected') return false;
  return operation?.state === 'queued' || operation?.state === 'running' ? 1_000 : 15_000;
}

export function useCurrentBackupOperationQuery<TData = BackupCurrentOperationResult>(
  options: {
    enabled?: boolean;
    connectionState?: ConnectionState;
    select?: (data: BackupCurrentOperationResult) => TData;
  } = {}
) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: backupOperationKeys.current(),
    queryFn: ({ signal }) => getCurrentBackupOperation(signal),
    enabled,
    select: options.select,
    placeholderData: (previous) => previous,
    refetchInterval: (query) =>
      backupFallbackInterval(
        options.connectionState,
        (query.state.data as BackupCurrentOperationResult | undefined)?.operation,
        enabled
      ),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true
  });
}

export function useBackupOperationDetailQuery<TData = BackupOperationSummary>(
  operationId: string | null | undefined,
  options: {
    enabled?: boolean;
    connectionState?: ConnectionState;
    select?: (data: BackupOperationSummary) => TData;
  } = {}
) {
  const enabled = Boolean(operationId) && (options.enabled ?? true);
  return useQuery({
    queryKey: backupOperationKeys.detail(operationId ?? ''),
    queryFn: ({ signal }) => getBackupOperation(operationId!, signal),
    enabled,
    select: options.select,
    placeholderData: (previous) => previous,
    refetchInterval: (query) =>
      backupFallbackInterval(
        options.connectionState,
        query.state.data as BackupOperationSummary | undefined,
        enabled
      ),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true
  });
}

export const backupOperationInvalidation = {
  invalidateAll(client: QueryClient, options?: QueryInvalidationOptions) {
    return invalidateQuery(client, { queryKey: backupOperationKeys.all }, options);
  }
};
