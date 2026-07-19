import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ListTasksUseCase } from '../../application/use-cases/list-tasks.usecase.js';
import type { GetTaskUseCase } from '../../application/use-cases/get-task.usecase.js';
import type { GetTaskSummaryUseCase } from '../../application/use-cases/get-task-summary.usecase.js';
import { ok } from '../../../../shared/http/api-response.js';
import { parseParams } from '../../../../shared/validation/validate.js';
import {
  toTaskListResponse,
  toTaskResponse,
  toTaskSummaryResponse
} from '../mappers/task-response.mapper.js';

const taskParamsSchema = z.object({ id: z.string().min(1) });

export class TaskController {
  constructor(
    private readonly listTasks: ListTasksUseCase,
    private readonly getTask: GetTaskUseCase,
    private readonly getTaskSummary: GetTaskSummaryUseCase
  ) {}

  list = async (_req: Request, res: Response) =>
    ok(res, toTaskListResponse(await this.listTasks.execute(100)));

  summary = async (_req: Request, res: Response) =>
    ok(res, toTaskSummaryResponse(await this.getTaskSummary.execute()));

  detail = async (req: Request, res: Response) => {
    const params = parseParams(req, taskParamsSchema);
    return ok(res, toTaskResponse(await this.getTask.execute(params.id)));
  };
}
