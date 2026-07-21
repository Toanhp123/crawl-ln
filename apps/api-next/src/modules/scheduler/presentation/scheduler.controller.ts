import { IdParamsSchema, UpdateNovelPolicyRequestSchema } from '@novel-tool/shared';
import type { Request, Response } from 'express';
import { ok } from '../../../platform/http/api-response.js';
import type { SchedulerApi } from '../public/scheduler.api.js';

export class SchedulerController {
  constructor(private readonly api: SchedulerApi) {}

  status = async (_request: Request, response: Response) =>
    ok(response, await this.api.queries.status());

  tick = async (_request: Request, response: Response) => {
    await this.api.lifecycle.tick();
    return ok(response, await this.api.queries.status());
  };

  updatePolicy = async (request: Request, response: Response) => {
    const params = IdParamsSchema.parse(request.params);
    const body = UpdateNovelPolicyRequestSchema.parse(request.body);
    return ok(
      response,
      await this.api.commands.updatePolicy({
        novelId: params.id,
        enabled: body.enabled,
        intervalMinutes: body.intervalMinutes
      })
    );
  };

  listDiagnostics = async (request: Request, response: Response) => {
    const params = IdParamsSchema.parse(request.params);
    return ok(response, await this.api.queries.listDiagnostics(params.id));
  };
}
