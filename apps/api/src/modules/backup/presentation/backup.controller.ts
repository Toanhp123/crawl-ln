import type { Request, Response } from 'express';
import { z } from 'zod';
import type { RealtimeEventPublisher } from '../../../platform/realtime/realtime-event.js';
import { ok } from '../../../platform/http/api-response.js';
import { BackupBadRequestError } from '../application/errors/backup.error.js';
import type { BackupApi } from '../public/backup.api.js';

const createBackupRequestSchema = z.object({
  password: z.string().max(256).optional(),
  settings: z.record(z.unknown()).optional()
});

const restoreHeadersSchema = z.object({
  mode: z.enum(['replace', 'merge']).default('replace'),
  settingsMode: z.enum(['keep-current', 'use-backup']).default('keep-current'),
  password: z.string().max(256).optional(),
  currentSettings: z.string().optional()
});

export class BackupController {
  constructor(
    private readonly api: BackupApi,
    private readonly realtime?: RealtimeEventPublisher
  ) {}

  create = async (request: Request, response: Response) => {
    const artifact = await this.api.commands.create(createBackupRequestSchema.parse(request.body));
    response.setHeader('Content-Disposition', `attachment; filename="${artifact.filename}"`);
    response.setHeader('X-Backup-Encrypted', String(artifact.encrypted));
    return response.type(artifact.contentType).send(artifact.content);
  };

  restore = async (request: Request, response: Response) => {
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new BackupBadRequestError('Backup file is required');
    }
    const parsed = restoreHeadersSchema.parse({
      mode: request.header('x-restore-mode') ?? 'replace',
      settingsMode: request.header('x-settings-mode') ?? 'keep-current',
      password: request.header('x-backup-password') ?? undefined,
      currentSettings: request.header('x-current-settings') ?? undefined
    });
    let currentSettings: Record<string, unknown> = {};
    if (parsed.currentSettings) {
      try {
        currentSettings = z
          .record(z.unknown())
          .parse(JSON.parse(Buffer.from(parsed.currentSettings, 'base64').toString('utf8')));
      } catch {
        throw new BackupBadRequestError('Current settings header is invalid');
      }
    }
    const result = await this.api.commands.restore({
      content: request.body,
      password: parsed.password,
      mode: parsed.mode,
      settingsMode: parsed.settingsMode,
      currentSettings
    });
    this.realtime?.publish({
      type: 'data.changed',
      resources: ['all'],
      reason: 'backup.restored'
    });
    return ok(response, result);
  };
}
