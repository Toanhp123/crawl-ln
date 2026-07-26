import type { QueryClient } from '@tanstack/react-query';
import type { QueryInvalidationOptions } from '../../../shared/api';
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
  invalidateAll: (client, options) => client.invalidateQueries({ queryKey: taskKeys.all }, options),
  invalidateList: (client, options) =>
    client.invalidateQueries({ queryKey: taskKeys.lists() }, options),
  invalidateSummary: (client, options) =>
    client.invalidateQueries({ queryKey: taskKeys.summary() }, options),
  invalidateDetail: (client, id, options) =>
    client.invalidateQueries({ queryKey: taskKeys.detail(id) }, options),
  invalidateEvents: (client, id, options) =>
    client.invalidateQueries({ queryKey: taskKeys.events(id) }, options),
  invalidateForNovel: (client, id, options) =>
    client.invalidateQueries({ queryKey: taskKeys.novel(id) }, options)
};
