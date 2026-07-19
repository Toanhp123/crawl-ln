import type { Request, Response } from 'express';
import type {
  ListSourcePluginsUseCase,
  ReloadSourcePluginsUseCase,
  SetSourcePluginEnabledUseCase
} from '../../application/use-cases/manage-source-plugins.usecase.js';
import type { RealtimeEventPublisher } from '../../../../shared/realtime/realtime-event-broker.js';
import { ok } from '../../../../shared/http/api-response.js';
import { parseBody, parseParams } from '../../../../shared/validation/validate.js';
import { sourcePluginEnabledDto, sourcePluginParamsDto } from '../dto/source-plugin.dto.js';
export class SourcePluginController {
  constructor(
    private readonly listPlugins: ListSourcePluginsUseCase,
    private readonly reloadPlugins: ReloadSourcePluginsUseCase,
    private readonly setEnabled: SetSourcePluginEnabledUseCase,
    private readonly realtime: RealtimeEventPublisher
  ) {}
  list = async (_req: Request, res: Response) => ok(res, this.listPlugins.execute());
  reload = async (_req: Request, res: Response) => {
    const result = await this.reloadPlugins.execute();
    this.realtime.publish({
      type: 'data.changed',
      resources: ['plugins'],
      reason: 'plugins.reloaded'
    });
    return ok(res, result);
  };
  update = async (req: Request, res: Response) => {
    const { id } = parseParams(req, sourcePluginParamsDto);
    const { enabled } = parseBody(req, sourcePluginEnabledDto);
    const result = await this.setEnabled.execute(id, enabled);
    this.realtime.publish({
      type: 'data.changed',
      resources: ['plugins'],
      reason: 'plugin.updated'
    });
    return ok(res, result);
  };
}
