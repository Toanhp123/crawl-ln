import type { QueryClient } from '@tanstack/react-query';
import { taskKeys } from './task-keys';

export interface TaskInvalidationApi {
  invalidateAll(client: QueryClient): Promise<unknown>;
  invalidateList(client: QueryClient): Promise<unknown>;
  invalidateSummary(client: QueryClient): Promise<unknown>;
  invalidateDetail(client: QueryClient, taskId: string): Promise<unknown>;
  invalidateEvents(client: QueryClient, taskId: string): Promise<unknown>;
  invalidateNovel(client: QueryClient, novelId: string): Promise<unknown>;
}

export const taskInvalidation: TaskInvalidationApi = {
  invalidateAll: (client) => client.invalidateQueries({ queryKey: taskKeys.all }),
  invalidateList: (client) => client.invalidateQueries({ queryKey: taskKeys.lists() }),
  invalidateSummary: (client) => client.invalidateQueries({ queryKey: taskKeys.summary() }),
  invalidateDetail: (client, id) => client.invalidateQueries({ queryKey: taskKeys.detail(id) }),
  invalidateEvents: (client, id) => client.invalidateQueries({ queryKey: taskKeys.events(id) }),
  invalidateNovel: (client, id) => client.invalidateQueries({ queryKey: taskKeys.novel(id) })
};
