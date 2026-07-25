import type { Request, Response } from 'express';
import { z } from 'zod';
import { accepted, created, ok } from '../../../platform/http/api-response.js';
import { BackupOperationError } from '../application/errors/backup.error.js';
import type { RestoreInspectionCoordinator } from '../application/services/restore-inspection.coordinator.js';
import type { RestoreInspectionService } from '../application/services/restore-inspection.service.js';
import type { RestorePreparationService } from '../application/services/restore-preparation.service.js';
import type { RestoreExecutionService } from '../application/services/restore-execution.service.js';
import { toBackupOperationSummary } from './backup-operation.presenter.js';

const createSchema = z
  .object({
    filename: z.string().min(1).max(1024),
    size: z.number().int(),
    fingerprint: z.string().max(256),
    replaceExisting: z.boolean().default(false)
  })
  .strict();
const sessionParamsSchema = z.object({ sessionId: z.string().min(1).max(200) }).strict();
const tokenSchema = z.string().min(1).max(512);
const offsetSchema = z.coerce.number().int().nonnegative();
const unlockSchema = z.object({ password: z.string().min(1).max(1024) }).strict();
const idempotencyKeySchema = z.string().min(1).max(200);
const startRestoreSchema = z
  .object({
    inspectionToken: z.string().min(1).max(512),
    planFingerprint: z.string().regex(/^sha256-plan-v1:[a-f0-9]{64}$/),
    confirmation: z
      .object({
        accepted: z.boolean(),
        typedPhrase: z.string().max(128).optional()
      })
      .strict(),
    currentSettings: z.record(z.unknown()).default({})
  })
  .strict();
const planSchema = z
  .object({
    mode: z.enum(['merge', 'replace']),
    settingsPolicy: z.enum(['keep-current', 'use-backup'])
  })
  .strict();

export class RestoreSessionController {
  constructor(
    private readonly preparation: RestorePreparationService,
    private readonly inspection: RestoreInspectionService,
    private readonly inspectionCoordinator: RestoreInspectionCoordinator,
    private readonly execution: RestoreExecutionService
  ) {}

  create = async (request: Request, response: Response) => {
    const input = createSchema.parse(request.body);
    return created(
      response,
      await this.preparation.create({
        filename: input.filename,
        size: input.size,
        fingerprint: input.fingerprint as `sha256-partial-v1:${string}`,
        replaceExisting: input.replaceExisting
      })
    );
  };

  current = async (_request: Request, response: Response) => {
    return ok(response, { session: this.preparation.current() });
  };

  read = async (request: Request, response: Response) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const session = this.preparation.read(sessionId, this.sessionToken(request));
    return ok(response, {
      ...session,
      inspectionToken: this.inspection.inspectionToken(sessionId)
    });
  };

  append = async (request: Request, response: Response) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new BackupOperationError(
        'RESTORE_UPLOAD_INVALID',
        422,
        'Restore upload chunk is required',
        false
      );
    }
    const contentLength = request.header('content-length');
    if (contentLength === undefined || Number(contentLength) !== request.body.length) {
      throw new BackupOperationError(
        'RESTORE_UPLOAD_INVALID',
        422,
        'Content-Length does not match the restore upload chunk',
        false
      );
    }
    const uploadOffset = request.header('upload-offset');
    if (uploadOffset === undefined) {
      throw new BackupOperationError(
        'RESTORE_UPLOAD_INVALID',
        422,
        'Upload-Offset header is required',
        false
      );
    }
    return ok(
      response,
      await this.preparation.append({
        sessionId,
        sessionToken: this.sessionToken(request),
        offset: offsetSchema.parse(uploadOffset),
        content: request.body
      })
    );
  };

  complete = async (request: Request, response: Response) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const session = this.inspection.requestComplete(sessionId, this.sessionToken(request));
    this.inspectionCoordinator.schedule(sessionId);
    return accepted(response, session);
  };

  unlock = async (request: Request, response: Response) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    this.preparation.requireAuthenticated(sessionId, this.sessionToken(request));
    const { password } = unlockSchema.parse(request.body);
    return ok(response, await this.inspection.unlock(sessionId, password));
  };

  plan = async (request: Request, response: Response) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const input = planSchema.parse(request.body);
    return ok(
      response,
      await this.preparation.createPlan(sessionId, this.sessionToken(request), input)
    );
  };

  startRestore = async (request: Request, response: Response) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const idempotencyKey = idempotencyKeySchema.parse(request.header('idempotency-key'));
    const input = startRestoreSchema.parse(request.body);
    const operation = this.execution.start({
      sessionId,
      sessionToken: this.sessionToken(request),
      inspectionToken: input.inspectionToken,
      planFingerprint: input.planFingerprint,
      idempotencyKey,
      confirmation: input.confirmation,
      currentSettings: input.currentSettings
    });
    return accepted(response, toBackupOperationSummary(operation));
  };

  touch = async (request: Request, response: Response) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return ok(response, this.preparation.touch(sessionId, this.sessionToken(request)));
  };

  cancel = async (request: Request, response: Response) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return ok(response, await this.preparation.cancel(sessionId, this.sessionToken(request)));
  };

  private sessionToken(request: Request): string {
    return tokenSchema.parse(request.header('session-token'));
  }
}
