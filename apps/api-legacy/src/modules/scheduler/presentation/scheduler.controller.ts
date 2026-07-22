import type { Request, Response } from 'express';
import { UpdateNovelPolicyRequestSchema, IdParamsSchema } from '@novel-tool/shared';
import type { AutoUpdateSchedulerService } from '../application/auto-update-scheduler.service.js';
import type { UpdateAutoUpdatePolicyUseCase } from '../application/update-auto-update-policy.usecase.js';
import type { ListNovelUpdateDiagnosticsUseCase } from '../application/list-novel-update-diagnostics.usecase.js';
import type { RealtimeEventPublisher } from '../../../shared/realtime/realtime-event-broker.js';
import { ok } from '../../../shared/http/api-response.js';
import { parseBody, parseParams } from '../../../shared/validation/validate.js';

export class SchedulerController {
  constructor(
    private readonly scheduler: AutoUpdateSchedulerService,
    private readonly updatePolicy: UpdateAutoUpdatePolicyUseCase,
    private readonly diagnostics: ListNovelUpdateDiagnosticsUseCase,
    private readonly realtime: RealtimeEventPublisher
  ) {}
  status = async (_req: Request, res: Response) => ok(res, await this.scheduler.status());
  tick = async (_req: Request, res: Response) => {
    await this.scheduler.tick();
    const status = await this.scheduler.status();
    this.realtime.publish({
      type: 'data.changed',
      resources: ['scheduler'],
      reason: 'scheduler.tick.completed'
    });
    return ok(res, status);
  };
  updatePolicyHandler = async (req: Request, res: Response) => {
    const params = parseParams(req, IdParamsSchema);
    const body = parseBody(req, UpdateNovelPolicyRequestSchema);
    const result = await this.updatePolicy.execute(params.id, body.enabled, body.intervalMinutes);
    this.realtime.publish({
      type: 'data.changed',
      resources: ['scheduler', 'novels'],
      reason: 'scheduler.policy.updated',
      novelId: params.id
    });
    return ok(res, result);
  };
  diagnosticsHandler = async (req: Request, res: Response) => {
    const params = parseParams(req, IdParamsSchema);
    return ok(res, await this.diagnostics.execute(params.id));
  };
}
