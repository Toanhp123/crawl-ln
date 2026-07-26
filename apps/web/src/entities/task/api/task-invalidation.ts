import type { QueryClient } from '@tanstack/react-query';
import { invalidateQuery, type QueryInvalidationOptions } from '../../../shared/api';
import { taskKeys } from './task-keys';

export interface TaskInvalidationApi {
  invalidateAll(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
  invalidateList(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
  invalidateSummary(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
  invalidateDetail(
    client: QueryClient,
    taskId: string,
    options?: QueryInvalidationOptions
  ): Promise<unknown>;
  invalidateEvents(
    client: QueryClient,
    taskId: string,
    options?: QueryInvalidationOptions
  ): Promise<unknown>;
  invalidateForNovel(
    client: QueryClient,
    novelId: string,
    options?: QueryInvalidationOptions
  ): Promise<unknown>;
}

export const taskInvalidation: TaskInvalidationApi = {
  invalidateAll: (client, options) => invalidateQuery(client, { queryKey: taskKeys.all }, options),
  invalidateList: (client, options) =>
    invalidateQuery(client, { queryKey: taskKeys.lists() }, options),
  invalidateSummary: (client, options) =>
    invalidateQuery(client, { queryKey: taskKeys.summary() }, options),
  invalidateDetail: (client, id, options) =>
    invalidateQuery(client, { queryKey: taskKeys.detail(id) }, options),
  invalidateEvents: (client, id, options) =>
    invalidateQuery(client, { queryKey: taskKeys.events(id) }, options),
  invalidateForNovel: (client, id, options) =>
    invalidateQuery(client, { queryKey: taskKeys.novel(id) }, options)
};
