import { GetNovelTaskUseCase } from '../../../modules/task/application/use-cases/get-novel-task.usecase.js';
import { GetTaskUseCase } from '../../../modules/task/application/use-cases/get-task.usecase.js';
import { GetTaskSummaryUseCase } from '../../../modules/task/application/use-cases/get-task-summary.usecase.js';
import { ListTasksUseCase } from '../../../modules/task/application/use-cases/list-tasks.usecase.js';
import { TaskSqliteRepository } from '../../../modules/task/infrastructure/sqlite/task-sqlite.repository.js';
import { TaskCrawlSqliteWriter } from '../../../modules/task/infrastructure/sqlite/task-crawl-sqlite.writer.js';
import { TaskLifecycleService } from '../../../modules/task/application/services/task-lifecycle.service.js';
import { TaskController } from '../../../modules/task/presentation/controllers/task.controller.js';
import type { InfrastructureModule } from './infrastructure.module.js';
import type { TasksApi } from '../../../modules/task/public/tasks.api.js';

export function createTasksModule(infrastructure: InfrastructureModule) {
  const repository = new TaskSqliteRepository(infrastructure.database);
  const listTasks = new ListTasksUseCase(repository);
  const getTask = new GetTaskUseCase(repository);
  const getTaskSummary = new GetTaskSummaryUseCase(repository);
  const getNovelTask = new GetNovelTaskUseCase(repository);
  const lifecycle = new TaskLifecycleService(repository);
  const crawlWriter = new TaskCrawlSqliteWriter(infrastructure.database);

  const publicApi = {
    getNovelTask,
    lifecycle,
    activeTasks: { hasForNovel: (novelId: string) => repository.hasActiveForNovel(novelId) }
  } satisfies TasksApi;

  return {
    api: {
      listTasks,
      getTask,
      getTaskSummary,
      ...publicApi
    },
    persistence: { crawlWriter },
    presentation: { controller: new TaskController(listTasks, getTask, getTaskSummary) }
  };
}

export type TasksModule = ReturnType<typeof createTasksModule>;
