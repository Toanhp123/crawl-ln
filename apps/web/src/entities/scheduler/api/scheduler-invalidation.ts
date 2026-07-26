import type { QueryClient } from '@tanstack/react-query';
import type { QueryInvalidationOptions } from '../../../shared/api';
import { schedulerKeys } from './scheduler-keys';

export interface SchedulerInvalidationApi {
  invalidateAll(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
  invalidateStatus(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
  invalidateDiagnostics(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
  invalidateNovelDiagnostics(
    client: QueryClient,
    novelId: string,
    options?: QueryInvalidationOptions
  ): Promise<unknown>;
}

export const schedulerInvalidation: SchedulerInvalidationApi = {
  invalidateAll: (client, options) =>
    client.invalidateQueries({ queryKey: schedulerKeys.all }, options),
  invalidateStatus: (client, options) =>
    client.invalidateQueries({ queryKey: schedulerKeys.status() }, options),
  invalidateDiagnostics: (client, options) =>
    client.invalidateQueries({ queryKey: schedulerKeys.diagnosticsRoot() }, options),
  invalidateNovelDiagnostics: (client, id, options) =>
    client.invalidateQueries({ queryKey: schedulerKeys.diagnostics(id) }, options)
};
