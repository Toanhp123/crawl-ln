import type { QueryClient } from '@tanstack/react-query';
import { schedulerKeys } from './scheduler-keys';

export interface SchedulerInvalidationApi {
  invalidateAll(client: QueryClient): Promise<unknown>;
  invalidateStatus(client: QueryClient): Promise<unknown>;
  invalidateDiagnostics(client: QueryClient): Promise<unknown>;
  invalidateNovelDiagnostics(client: QueryClient, novelId: string): Promise<unknown>;
}

export const schedulerInvalidation: SchedulerInvalidationApi = {
  invalidateAll: (client) => client.invalidateQueries({ queryKey: schedulerKeys.all }),
  invalidateStatus: (client) => client.invalidateQueries({ queryKey: schedulerKeys.status() }),
  invalidateDiagnostics: (client) =>
    client.invalidateQueries({ queryKey: schedulerKeys.diagnosticsRoot() }),
  invalidateNovelDiagnostics: (client, id) =>
    client.invalidateQueries({ queryKey: schedulerKeys.diagnostics(id) })
};
