import type { Request, Response } from 'express';
import { BackupBadRequestError } from '../../application/errors/backup.error.js';
import type { RealtimeEventPublisher } from '../../../../shared/realtime/realtime-event-broker.js';
import { ok } from '../../../../shared/http/api-response.js';
import { parseBody } from '../../../../shared/validation/validate.js';
import type { CreateBackupUseCase } from '../../application/use-cases/create-backup.usecase.js';
import type { RestoreBackupUseCase } from '../../application/use-cases/restore-backup.usecase.js';
import { createBackupRequestDto, restoreHeadersDto } from '../dto/backup.dto.js';

export class BackupController {
  constructor(
    private readonly createBackup: CreateBackupUseCase,
    private readonly restoreBackup: RestoreBackupUseCase,
    private readonly realtime: RealtimeEventPublisher
  ) {}

  create = async (req: Request, res: Response) => {
    const input = parseBody(req, createBackupRequestDto);
    const artifact = await this.createBackup.execute(input);
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.filename}"`);
    res.setHeader('X-Backup-Encrypted', String(artifact.encrypted));
    return res.type(artifact.contentType).send(artifact.content);
  };

  restore = async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0)
      throw new BackupBadRequestError('Backup file is required');
    const parsed = restoreHeadersDto.parse({
      mode: req.header('x-restore-mode') ?? 'replace',
      settingsMode: req.header('x-settings-mode') ?? 'keep-current',
      password: req.header('x-backup-password') ?? undefined,
      currentSettings: req.header('x-current-settings') ?? undefined
    });
    let currentSettings: Record<string, unknown> = {};
    if (parsed.currentSettings) {
      try {
        currentSettings = JSON.parse(
          Buffer.from(parsed.currentSettings, 'base64').toString('utf8')
        ) as Record<string, unknown>;
      } catch {
        throw new BackupBadRequestError('Current settings header is invalid');
      }
    }
    const result = await this.restoreBackup.execute({
      content: req.body,
      password: parsed.password,
      mode: parsed.mode,
      settingsMode: parsed.settingsMode,
      currentSettings
    });
    this.realtime.publish({
      type: 'data.changed',
      resources: ['all'],
      reason: 'backup.restored'
    });
    return ok(res, result);
  };
}
